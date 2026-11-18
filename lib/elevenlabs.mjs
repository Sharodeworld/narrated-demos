import { ElevenLabsClient } from "@elevenlabs/elevenlabs-js";

// The SDK reads ELEVENLABS_API_KEY from the environment. The key lives in the demos folder's
// git-ignored .env (or the shell environment) and never goes in code or config.
export const elevenlabs = new ElevenLabsClient();

// The narrator voice, chosen in ElevenLabs and kept in the same .env.
export const voiceId = process.env.ELEVENLABS_VOICE_ID;
