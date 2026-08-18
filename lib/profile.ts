// Profile picture handling: pick an image, push it to Supabase Storage, and
// record the resulting public URL on the user's metadata so `avatarUrlFor()`
// picks it up everywhere (currently the home header and the settings screen).
import { supabase } from '@/lib/supabase';
import * as ImagePicker from 'expo-image-picker';

const AVATAR_BUCKET = 'avatars';

const EXTENSION_BY_MIME: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/heic': 'heic',
};

/**
 * Opens the photo library. Returns null when the user dismisses the picker,
 * and throws when permission was refused.
 */
export const pickAvatarImage = async (): Promise<ImagePicker.ImagePickerAsset | null> => {
  const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!permission.granted) {
    throw new Error('Recurly needs access to your photos to set a profile picture.');
  }

  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    allowsEditing: true,
    // Avatars render in a circle, so crop to a square up front.
    aspect: [1, 1],
    quality: 0.7,
  });

  if (result.canceled || !result.assets?.length) return null;
  return result.assets[0];
};

/** Recovers the storage path from a public URL we previously stored. */
const pathFromPublicUrl = (url: string | null | undefined): string | null => {
  if (!url) return null;
  const marker = `/object/public/${AVATAR_BUCKET}/`;
  const index = url.indexOf(marker);
  if (index === -1) return null;
  return decodeURIComponent(url.slice(index + marker.length).split('?')[0]);
};

/**
 * Uploads the picked image and points the user's `avatar_url` metadata at it.
 * Resolves to the new public URL.
 */
export const uploadAvatar = async (
  asset: ImagePicker.ImagePickerAsset
): Promise<string> => {
  const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
  if (sessionError) throw sessionError;

  const user = sessionData.session?.user;
  if (!user) throw new Error('You must be signed in to change your profile picture.');

  const contentType = asset.mimeType ?? 'image/jpeg';
  const extension =
    EXTENSION_BY_MIME[contentType] ?? asset.uri.split('.').pop()?.toLowerCase() ?? 'jpg';

  // Each upload gets a fresh name. Reusing one path would keep the public URL
  // identical and the old image would stay stuck in the image cache.
  const path = `${user.id}/${Date.now()}.${extension}`;

  // The picker hands back a local file:// uri; fetch turns it into bytes.
  const bytes = await fetch(asset.uri).then((response) => response.arrayBuffer());

  const { error: uploadError } = await supabase.storage
    .from(AVATAR_BUCKET)
    .upload(path, bytes, { contentType, upsert: true });
  if (uploadError) throw uploadError;

  const {
    data: { publicUrl },
  } = supabase.storage.from(AVATAR_BUCKET).getPublicUrl(path);

  const previousPath = pathFromPublicUrl(user.user_metadata?.avatar_url);

  const { error: updateError } = await supabase.auth.updateUser({
    data: { avatar_url: publicUrl },
  });
  if (updateError) throw updateError;

  // Best effort tidy-up of the image we just replaced — the new avatar is
  // already live, so a failure here isn't worth surfacing.
  if (previousPath && previousPath.startsWith(`${user.id}/`) && previousPath !== path) {
    await supabase.storage.from(AVATAR_BUCKET).remove([previousPath]);
  }

  return publicUrl;
};

/**
 * Saves the user's display name to their metadata. `useAuth()` picks up the
 * resulting USER_UPDATED event, so the settings screen and the home header
 * both re-render with the new name.
 */
export const updateDisplayName = async (name: string): Promise<void> => {
  const { error } = await supabase.auth.updateUser({
    data: { full_name: name.trim() },
  });
  if (error) throw error;
};
