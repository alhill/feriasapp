import * as Network from 'expo-network';

// A lightweight endpoint that returns 204 No Content — minimal data, maximum reliability.
const PROBE_URL = 'https://clients3.google.com/generate_204';
const PROBE_TIMEOUT_MS = 5000;

/**
 * Returns true if the device has a functional internet connection.
 *
 * Two-stage check:
 *  1. Fast fail: if the OS reports no connection, return false immediately.
 *  2. Real probe: even when the OS reports "connected" (e.g. congested cell
 *     towers at festivals), we verify by fetching a tiny endpoint. If the
 *     request times out or fails, we treat the network as non-functional.
 */
export async function hasWorkingInternet(): Promise<boolean> {
  try {
    const state = await Network.getNetworkStateAsync();
    if (!state.isConnected) {
      return false;
    }
  } catch {
    // If expo-network itself fails, fall through to the probe.
  }

  return probeInternet();
}

async function probeInternet(): Promise<boolean> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS);

  try {
    const response = await fetch(PROBE_URL, {
      method: 'HEAD',
      signal: controller.signal,
      cache: 'no-store',
    });
    // 204 is the expected response; any HTTP response means the network works.
    return response.status < 600;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}
