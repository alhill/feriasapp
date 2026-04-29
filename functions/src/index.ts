import { GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions';
import { onDocumentCreated } from 'firebase-functions/v2/firestore';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import OpenAI from 'openai';

import { type JournalEvent } from './types';

initializeApp();

const db = getFirestore();
const OPENAI_MODEL = process.env.OPENAI_MODEL ?? 'gpt-4.1-mini';
const openai = process.env.OPENAI_API_KEY
  ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  : null;

type ModuleDefinition = {
  id: string;
  description: string;
};

type ModuleStructuredData = Record<string, Record<string, unknown>>;

type UploadRequest = {
  contentType: string;
  extension: string;
};

type UploadResponse = {
  uploadUrl: string;
  objectKey: string;
};

type ReadUrlRequest = {
  objectKey: string;
};

type ReadUrlResponse = {
  readUrl: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isJournalEvent(value: unknown): value is JournalEvent {
  if (!isRecord(value)) {
    return false;
  }

  return (
    typeof value.id === 'string' &&
    typeof value.timestamp === 'string' &&
    typeof value.type === 'string' &&
    typeof value.source === 'string' &&
    typeof value.user_input === 'string' &&
    Array.isArray(value.modules_active) &&
    isRecord(value.structured_data)
  );
}

function parseJsonObject(value: string): Record<string, unknown> {
  const parsed = JSON.parse(value) as unknown;
  if (!isRecord(parsed)) {
    throw new Error('Model response was not a JSON object.');
  }
  return parsed;
}

async function listActiveModules(): Promise<ModuleDefinition[]> {
  const snapshot = await db.collection('modules').where('active', '==', true).get();

  return snapshot.docs
    .map((doc) => {
      const data = doc.data();
      const description = typeof data.description === 'string' ? data.description : '';
      return {
        id: doc.id,
        description,
      };
    })
    .filter((module) => module.description.length > 0);
}

async function detectModulesWithLlm(
  userInput: string,
  modules: ModuleDefinition[]
): Promise<string[]> {
  if (!openai || modules.length === 0) {
    return [];
  }

  const moduleLines = modules.map((module) => `- ${module.id}: ${module.description}`).join('\n');

  const completion = await openai.chat.completions.create({
    model: OPENAI_MODEL,
    temperature: 0,
    response_format: { type: 'json_object' },
    messages: [
      {
        role: 'system',
        content:
          'You are a module detector. Return JSON with one key "modules" containing a string array of module ids that apply.',
      },
      {
        role: 'user',
        content: `User input:\n${userInput}\n\nAvailable modules:\n${moduleLines}`,
      },
    ],
  });

  const raw = completion.choices[0]?.message?.content;
  if (!raw) {
    return [];
  }

  const parsed = parseJsonObject(raw);
  const maybeModules = parsed.modules;

  if (!Array.isArray(maybeModules)) {
    return [];
  }

  const activeModuleIds = new Set(modules.map((module) => module.id));

  return maybeModules
    .filter((moduleId): moduleId is string => typeof moduleId === 'string')
    .filter((moduleId) => activeModuleIds.has(moduleId));
}

async function extractStructuredDataWithLlm(
  userInput: string,
  selectedModules: ModuleDefinition[]
): Promise<ModuleStructuredData> {
  if (!openai || selectedModules.length === 0) {
    return {};
  }

  const moduleLines = selectedModules
    .map((module) => `- ${module.id}: ${module.description}`)
    .join('\n');

  const completion = await openai.chat.completions.create({
    model: OPENAI_MODEL,
    temperature: 0,
    response_format: { type: 'json_object' },
    messages: [
      {
        role: 'system',
        content:
          'Extract structured JSON per module. Return an object where keys are module ids and values are JSON objects with extracted fields.',
      },
      {
        role: 'user',
        content: `User input:\n${userInput}\n\nSelected modules:\n${moduleLines}`,
      },
    ],
  });

  const raw = completion.choices[0]?.message?.content;
  if (!raw) {
    return {};
  }

  const parsed = parseJsonObject(raw);
  const output: ModuleStructuredData = {};

  for (const [moduleId, value] of Object.entries(parsed)) {
    if (isRecord(value)) {
      output[moduleId] = value;
    }
  }

  return output;
}

async function createSystemGeneratedEvent(args: {
  userId: string;
  relatedEventId: string;
  modulesActive: string[];
  structuredData: ModuleStructuredData;
  userInput: string;
  status: JournalEvent['status'];
}): Promise<void> {
  const eventRef = db.collection('users').doc(args.userId).collection('events').doc();

  const event: JournalEvent = {
    id: eventRef.id,
    timestamp: new Date().toISOString(),
    type: 'system_generated',
    source: 'text',
    user_input: args.userInput,
    modules_active: args.modulesActive,
    structured_data: args.structuredData,
    related_events: [args.relatedEventId],
    status: args.status,
  };

  await eventRef.set(event);
}

export const processUserEvent = onDocumentCreated(
  {
    document: 'users/{userId}/events/{eventId}',
    region: 'us-central1',
  },
  async (event) => {
    const userId = event.params.userId;
    const eventId = event.params.eventId;
    const data = event.data?.data();

    if (!isJournalEvent(data)) {
      logger.warn('Skipping invalid event payload', { userId, eventId });
      return;
    }

    if (data.type !== 'user_note' && data.type !== 'user_deep') {
      return;
    }

    try {
      const modules = await listActiveModules();
      const detectedModuleIds = await detectModulesWithLlm(data.user_input, modules);
      const selectedModules = modules.filter((module) => detectedModuleIds.includes(module.id));
      const structuredData = await extractStructuredDataWithLlm(data.user_input, selectedModules);

      await createSystemGeneratedEvent({
        userId,
        relatedEventId: eventId,
        modulesActive: detectedModuleIds,
        structuredData,
        userInput: data.user_input,
        status: openai ? 'processed' : 'failed',
      });
    } catch (error) {
      logger.error('Failed processing event', { userId, eventId, error });

      await createSystemGeneratedEvent({
        userId,
        relatedEventId: eventId,
        modulesActive: [],
        structuredData: {
          pipeline_error: {
            message: 'Unable to process event at this time.',
          },
        },
        userInput: data.user_input,
        status: 'failed',
      });
    }
  }
);

function getRequiredServerEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing server env: ${name}`);
  }
  return value;
}

function createR2Client(): S3Client {
  return new S3Client({
    region: 'auto',
    endpoint: getRequiredServerEnv('R2_ENDPOINT'),
    credentials: {
      accessKeyId: getRequiredServerEnv('R2_ACCESS_KEY_ID'),
      secretAccessKey: getRequiredServerEnv('R2_SECRET_ACCESS_KEY'),
    },
  });
}

function sanitizeExtension(extension: string): string {
  const normalized = extension.trim().toLowerCase().replace('.', '');
  if (!/^[a-z0-9]{1,10}$/.test(normalized)) {
    throw new HttpsError('invalid-argument', 'Invalid file extension.');
  }
  return normalized;
}

function sanitizeObjectKey(objectKey: string): string {
  const normalized = objectKey.trim();
  if (!/^[a-zA-Z0-9/_\-.]{1,512}$/.test(normalized)) {
    throw new HttpsError('invalid-argument', 'Invalid object key.');
  }
  return normalized;
}

function assertCanAccessObjectKey(uid: string, objectKey: string): void {
  if (!objectKey.startsWith(`${uid}/`)) {
    throw new HttpsError('permission-denied', 'You do not have access to this object.');
  }
}

export const requestR2Upload = onCall<UploadRequest, Promise<UploadResponse>>(
  { region: 'us-central1' },
  async (request): Promise<UploadResponse> => {
    if (!request.auth?.uid) {
      throw new HttpsError('unauthenticated', 'Authentication required.');
    }

    const extension = sanitizeExtension(request.data.extension);
    const bucketName = getRequiredServerEnv('R2_BUCKET_NAME');

    const objectKey = `${request.auth.uid}/${Date.now()}.${extension}`;

    const command = new PutObjectCommand({
      Bucket: bucketName,
      Key: objectKey,
      ContentType: request.data.contentType,
    });

    const r2Client = createR2Client();
    const uploadUrl = await getSignedUrl(r2Client, command, { expiresIn: 60 * 5 });

    return {
      uploadUrl,
      objectKey,
    };
  }
);

export const getR2ReadUrl = onCall<ReadUrlRequest, Promise<ReadUrlResponse>>(
  { region: 'us-central1' },
  async (request): Promise<ReadUrlResponse> => {
    if (!request.auth?.uid) {
      throw new HttpsError('unauthenticated', 'Authentication required.');
    }

    const objectKey = sanitizeObjectKey(request.data.objectKey);
    assertCanAccessObjectKey(request.auth.uid, objectKey);

    const bucketName = getRequiredServerEnv('R2_BUCKET_NAME');
    const command = new GetObjectCommand({
      Bucket: bucketName,
      Key: objectKey,
    });

    const r2Client = createR2Client();
    const readUrl = await getSignedUrl(r2Client, command, { expiresIn: 60 * 2 });

    return { readUrl };
  }
);
