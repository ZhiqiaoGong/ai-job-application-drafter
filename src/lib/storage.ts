import type { Profile, Settings } from './types';

// chrome.storage.local is plain text inside the local Chrome profile. It is not
// encrypted, so nothing here should be treated as secure at-rest storage.
export const DEFAULT_SETTINGS: Settings = {
  provider: 'openai',
  apiKey: '',
  model: 'gpt-4o',
  tone: 'professional',
  customInstruction: '',
  useJobPosting: true,
};

const DEFAULT_PROFILE: Profile = { raw: '', updatedAt: 0 };

export async function getSettings(): Promise<Settings> {
  const stored = await chrome.storage.local.get('settings');
  return { ...DEFAULT_SETTINGS, ...(stored.settings as Partial<Settings> | undefined) };
}

export async function saveSettings(patch: Partial<Settings>): Promise<Settings> {
  const next = { ...(await getSettings()), ...patch };
  await chrome.storage.local.set({ settings: next });
  return next;
}

export async function getProfile(): Promise<Profile> {
  const stored = await chrome.storage.local.get('profile');
  return { ...DEFAULT_PROFILE, ...(stored.profile as Partial<Profile> | undefined) };
}

export async function saveProfile(raw: string): Promise<Profile> {
  const next: Profile = { raw, updatedAt: Date.now() };
  await chrome.storage.local.set({ profile: next });
  return next;
}
