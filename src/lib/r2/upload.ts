import { httpsCallable } from 'firebase/functions';

import { functions } from '@/lib/firebase/functions';

type RequestUploadInput = {
  contentType: string;
  extension: string;
};

type RequestUploadOutput = {
  uploadUrl: string;
  objectKey: string;
};

type RequestReadUrlInput = {
  objectKey: string;
};

type RequestReadUrlOutput = {
  readUrl: string;
};

export async function requestR2Upload(input: RequestUploadInput): Promise<RequestUploadOutput> {
  const callable = httpsCallable<RequestUploadInput, RequestUploadOutput>(
    functions,
    'requestR2Upload'
  );

  const response = await callable(input);
  return response.data;
}

export async function uploadFileToR2(uploadUrl: string, file: Blob): Promise<void> {
  const response = await fetch(uploadUrl, {
    method: 'PUT',
    headers: {
      'Content-Type': file.type,
    },
    body: file,
  });

  if (!response.ok) {
    throw new Error(`R2 upload failed with status ${response.status}`);
  }
}

export async function requestR2ReadUrl(objectKey: string): Promise<string> {
  const callable = httpsCallable<RequestReadUrlInput, RequestReadUrlOutput>(functions, 'getR2ReadUrl');
  const response = await callable({ objectKey });
  return response.data.readUrl;
}
