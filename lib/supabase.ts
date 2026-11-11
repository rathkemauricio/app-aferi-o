import 'react-native-url-polyfill/auto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import { createClient } from '@supabase/supabase-js';

const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
const key = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

export const isSupabaseConfigured = Boolean(url && key);
const sessionStorageAdapter = {
  async getItem(key: string) {
    // SecureStore is native-only. AsyncStorage provides the browser storage adapter on web.
    if (Platform.OS === 'web') return AsyncStorage.getItem(key);
    const countValue = await SecureStore.getItemAsync(`${key}.count`);
    if (!countValue) return null;
    const chunks = await Promise.all(Array.from({ length: Number(countValue) }, (_, i) => SecureStore.getItemAsync(`${key}.${i}`)));
    return chunks.some(chunk => chunk === null) ? null : chunks.join('');
  },
  async setItem(key: string, value: string) {
    if (Platform.OS === 'web') return AsyncStorage.setItem(key, value);
    const chunks = value.match(/.{1,1500}/g) ?? [''];
    const oldCount = Number(await SecureStore.getItemAsync(`${key}.count`) ?? 0);
    await Promise.all(chunks.map((chunk, i) => SecureStore.setItemAsync(`${key}.${i}`, chunk)));
    for (let i = chunks.length; i < oldCount; i++) await SecureStore.deleteItemAsync(`${key}.${i}`);
    await SecureStore.setItemAsync(`${key}.count`, String(chunks.length));
  },
  async removeItem(key: string) {
    if (Platform.OS === 'web') return AsyncStorage.removeItem(key);
    const count = Number(await SecureStore.getItemAsync(`${key}.count`) ?? 0);
    await Promise.all(Array.from({ length: count }, (_, i) => SecureStore.deleteItemAsync(`${key}.${i}`)));
    await SecureStore.deleteItemAsync(`${key}.count`);
  },
};

export const supabase = isSupabaseConfigured
  ? createClient(url!, key!, {
      auth: {
        storage: sessionStorageAdapter,
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: false,
      },
    })
  : null;
