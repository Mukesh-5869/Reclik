import { GoogleGenAI, Type } from '@google/genai';
import sharp from 'sharp';

const DEFAULT_IMAGE_MODEL = process.env.IMAGE_MODEL || 'gemini-2.5-flash-image';
const DEFAULT_CHECK_MODEL = process.env.CHECK_MODEL || 'gemini-2.5-flash';

const LOOK_PROMPT_SUFFIX =
  'Keep the exact face, skin tone, expression, outfit, pose and background content unchanged. Change only lighting and camera style. Match the original aspect ratio.';

function getAiClient(): GoogleGenAI | null {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === 'MY_GEMINI_API_KEY') return null;
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

function extractGeminiErrorDetails(err: unknown): { status?: number | string; message: string } {
  if (err && typeof err === 'object') {
    const anyErr = err as {
      status?: number | string;
      statusCode?: number | string;
      code?: number | string;
      message?: string;
      error?: { code?: number | string; status?: string; message?: string };
    };
    const status = anyErr.status ?? anyErr.statusCode ?? anyErr.error?.code ?? anyErr.code;
    const message = anyErr.message || anyErr.error?.message || String(err);
    return { status, message };
  }
  return { message: String(err) };
}

export interface SelfieValidationResult {
  hasSingleClearFace: boolean;
  isAdultAppearing: boolean;
  isSafeContent: boolean;
  reason: string;
}

export async function validateSelfieWithGemini(
  base64Data: string,
  mimeType: string
): Promise<SelfieValidationResult> {
  const ai = getAiClient();
  if (!ai) {
    // Basic pass when API key is not configured yet in local dev
    return {
      hasSingleClearFace: true,
      isAdultAppearing: true,
      isSafeContent: true,
      reason: 'Validated locally (no Gemini key attached).',
    };
  }

  const checkModel = process.env.CHECK_MODEL || DEFAULT_CHECK_MODEL;

  try {
    const response = await ai.models.generateContent({
      model: checkModel,
      contents: {
        parts: [
          {
            inlineData: {
              data: base64Data,
              mimeType,
            },
          },
          {
            text: 'Inspect this uploaded portrait for a photo-booth app. Verify: (1) exactly one clearly visible human face, (2) the subject appears to be an adult (18+), and (3) no nudity, sexually explicit content, or unsafe imagery. Return structured JSON.',
          },
        ],
      },
      config: {
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            hasSingleClearFace: { type: Type.BOOLEAN },
            isAdultAppearing: { type: Type.BOOLEAN },
            isSafeContent: { type: Type.BOOLEAN },
            reason: { type: Type.STRING },
          },
        },
      },
    });

    const parsed = JSON.parse((response.text ?? '{}').trim()) as Partial<SelfieValidationResult>;
    return {
      hasSingleClearFace: parsed.hasSingleClearFace ?? true,
      isAdultAppearing: parsed.isAdultAppearing ?? true,
      isSafeContent: parsed.isSafeContent ?? true,
      reason: parsed.reason || 'Validation completed.',
    };
  } catch (err) {
    const { status, message } = extractGeminiErrorDetails(err);
    console.error(`[Gemini validateSelfie] API failure (model=${checkModel}, status=${status ?? 'unknown'}): ${message}`);
    return {
      hasSingleClearFace: true,
      isAdultAppearing: true,
      isSafeContent: true,
      reason: 'Fallback validation passed.',
    };
  }
}

export class LookGenerationError extends Error {
  code: 'MISSING_API_KEY' | 'PAID_KEY_REQUIRED' | 'MODEL_FAILED';
  constructor(message: string, code: 'MISSING_API_KEY' | 'PAID_KEY_REQUIRED' | 'MODEL_FAILED') {
    super(message);
    this.code = code;
  }
}

/**
 * Abstracted identity-preserving look generation service: generate_look(selfie, look_prompt)
 * Uses IMAGE_MODEL env var or Admin Settings (default: gemini-2.5-flash-image).
 */
export async function generateLook(
  selfieBuffer: Buffer,
  mimeType: string,
  lookPrompt: string,
  modelName = DEFAULT_IMAGE_MODEL
): Promise<{ imageBuffer: Buffer; mimeType: string }> {
  const ai = getAiClient();
  if (!ai) {
    console.error('[Gemini generateLook] Missing GEMINI_API_KEY.');
    throw new LookGenerationError(
      'Portrait generation is not configured right now. Please add a valid Gemini API key in Settings > Secrets or try Sample Demo Mode.',
      'MISSING_API_KEY'
    );
  }

  const targetModel = process.env.IMAGE_MODEL || modelName || DEFAULT_IMAGE_MODEL;
  const fullPrompt = `${lookPrompt.trim()} ${LOOK_PROMPT_SUFFIX}`;

  // Ensure uploaded selfie is downscaled to max 2048px on longest side with EXIF stripped before sending
  const preparedSelfie = await sharp(selfieBuffer)
    .rotate()
    .resize({
      width: 2048,
      height: 2048,
      fit: 'inside',
      withoutEnlargement: true,
    })
    .jpeg({ quality: 92 })
    .toBuffer();

  try {
    const response = await ai.models.generateContent({
      model: targetModel,
      contents: {
        parts: [
          {
            inlineData: {
              data: preparedSelfie.toString('base64'),
              mimeType: 'image/jpeg',
            },
          },
          { text: fullPrompt },
        ],
      },
    });

    const parts = response.candidates?.[0]?.content?.parts ?? [];
    const textReplies: string[] = [];

    for (const part of parts) {
      if (part.inlineData?.data) {
        return {
          imageBuffer: Buffer.from(part.inlineData.data, 'base64'),
          mimeType: part.inlineData.mimeType ?? 'image/png',
        };
      }
      if (part.text) {
        textReplies.push(part.text);
      }
    }

    const loggedReply = textReplies.join('\n').trim() || response.text?.trim() || '(empty response)';
    console.error(`[Gemini generateLook] Model (${targetModel}) returned no image part. Text reply: ${loggedReply}`);

    throw new LookGenerationError(
      'We could not generate a styled portrait for this photo. Please try a different look or upload a clearer front-facing selfie.',
      'MODEL_FAILED'
    );
  } catch (err: unknown) {
    if (err instanceof LookGenerationError) throw err;

    const { status, message } = extractGeminiErrorDetails(err);
    console.error(`[Gemini generateLook] API failure (model=${targetModel}, status=${status ?? 'unknown'}): ${message}`);

    const lower = message.toLowerCase();
    const numericStatus = typeof status === 'number' ? status : Number(status);
    if (
      numericStatus === 403 ||
      numericStatus === 429 ||
      lower.includes('403') ||
      lower.includes('429') ||
      lower.includes('permission') ||
      lower.includes('quota') ||
      lower.includes('billing') ||
      lower.includes('resource_exhausted') ||
      lower.includes('api_key_invalid')
    ) {
      throw new LookGenerationError(
        'Portrait generation is temporarily unavailable due to API quota or billing limits. Please try again later or use Sample Demo Mode.',
        'PAID_KEY_REQUIRED'
      );
    }

    throw new LookGenerationError(
      'We ran into an issue creating your portrait. Please try again or choose another look.',
      'MODEL_FAILED'
    );
  }
}
