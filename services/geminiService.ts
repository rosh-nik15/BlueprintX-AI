import { GoogleGenAI, Type, Modality } from "@google/genai";
import { BlueprintAnalysis } from "../types";

// Initialize Gemini Client
const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

const SYSTEM_INSTRUCTION = `
Analyze the floor plan image. Output JSON geometry for 3D reconstruction and engineering analysis.
Geometry Rules:
1. Coord System: 0-100 normalized (0,0 top-left).
2. Walls: Start/end segments.
3. Rooms: Closed polygons.
4. Scale: Assume door width ~3ft.
Analysis:
1. Cost: Estimate material cost (10ft height).
2. Reno: Structural/lighting/flow issues.
3. Systems: Infer electrical/plumbing.
Output raw JSON only.
`;

const RESPONSE_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    walls: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          id: { type: Type.STRING },
          start: { type: Type.OBJECT, properties: { x: { type: Type.NUMBER }, y: { type: Type.NUMBER } } },
          end: { type: Type.OBJECT, properties: { x: { type: Type.NUMBER }, y: { type: Type.NUMBER } } },
          thickness: { type: Type.NUMBER },
          type: { type: Type.STRING, enum: ['brick', 'drywall', 'glass'] }
        }
      }
    },
    doors: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          id: { type: Type.STRING },
          position: { type: Type.OBJECT, properties: { x: { type: Type.NUMBER }, y: { type: Type.NUMBER } } },
          width: { type: Type.NUMBER },
          rotation: { type: Type.NUMBER }
        }
      }
    },
    rooms: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          id: { type: Type.STRING },
          name: { type: Type.STRING },
          areaSqFt: { type: Type.NUMBER },
          center: { type: Type.OBJECT, properties: { x: { type: Type.NUMBER }, y: { type: Type.NUMBER } } },
          polygon: { 
            type: Type.ARRAY, 
            items: { type: Type.OBJECT, properties: { x: { type: Type.NUMBER }, y: { type: Type.NUMBER } } }
          },
          suggestedColor: { type: Type.STRING, description: "Hex color code." },
          colorDescription: { type: Type.STRING }
        }
      }
    },
    material_cost_estimation: {
      type: Type.OBJECT,
      properties: {
        materials: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              item: { type: Type.STRING },
              quantity: { type: Type.STRING },
              unit: { type: Type.STRING },
              estimated_cost: { type: Type.STRING },
              basis_of_calculation: { type: Type.STRING }
            }
          }
        },
        total_estimated_cost: { type: Type.STRING }
      }
    },
    renovation_recommendations: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          detected_issue: { type: Type.STRING },
          recommended_action: { type: Type.STRING },
          benefit: { type: Type.STRING }
        }
      }
    },
    electrical_plumbing_safety: {
      type: Type.OBJECT,
      properties: {
        electrical: {
          type: Type.OBJECT,
          properties: {
            wiring_length: { type: Type.STRING },
            switchboard_positions: { type: Type.ARRAY, items: { type: Type.STRING } },
            socket_positions: { type: Type.ARRAY, items: { type: Type.STRING } },
            load_distribution: { type: Type.STRING }
          }
        },
        plumbing: {
          type: Type.OBJECT,
          properties: {
            pipe_routes: { type: Type.ARRAY, items: { type: Type.STRING } },
            pipe_sizes: { type: Type.STRING },
            wet_area_notes: { type: Type.STRING }
          }
        },
        safety_warnings: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              type: { type: Type.STRING },
              location: { type: Type.STRING },
              severity: { type: Type.STRING },
              recommended_fix: { type: Type.STRING }
            }
          }
        }
      }
    },
    summary: { type: Type.STRING }
  }
};

// Helper: Resize image to reduce token count and upload time
async function compressImage(base64Str: string): Promise<string> {
  return new Promise((resolve) => {
    const img = new Image();
    img.src = base64Str;
    img.onload = () => {
      // Max dimension 800px is sufficient for floor plan analysis and much faster
      const MAX_DIM = 800; 
      let width = img.width;
      let height = img.height;

      if (width > MAX_DIM || height > MAX_DIM) {
        const ratio = Math.min(MAX_DIM / width, MAX_DIM / height);
        width = Math.round(width * ratio);
        height = Math.round(height * ratio);
      } else {
        // If small enough, return original
        resolve(base64Str);
        return;
      }

      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.fillStyle = '#FFFFFF'; // Ensure white background for transparent PNGs
        ctx.fillRect(0, 0, width, height);
        ctx.drawImage(img, 0, 0, width, height);
        // Use JPEG 0.7 for good balance of speed/quality
        resolve(canvas.toDataURL('image/jpeg', 0.7));
      } else {
        resolve(base64Str);
      }
    };
    img.onerror = () => resolve(base64Str);
  });
}

export async function analyzeBlueprint(base64Image: string): Promise<BlueprintAnalysis> {
  try {
    // 1. Compress Image for Speed
    const compressedDataUrl = await compressImage(base64Image);
    const cleanBase64 = compressedDataUrl.replace(/^data:image\/(png|jpeg|jpg|webp);base64,/, "");

    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash", 
      contents: {
        parts: [
          { inlineData: { mimeType: "image/jpeg", data: cleanBase64 } },
          { text: "Analyze this floor plan and generate the 3D geometry JSON." }
        ]
      },
      config: {
        systemInstruction: SYSTEM_INSTRUCTION,
        responseMimeType: "application/json",
        responseSchema: RESPONSE_SCHEMA,
        thinkingConfig: { thinkingBudget: 0 } // Disable thinking for max speed
      }
    });

    const text = response.text;
    if (!text) throw new Error("No data returned from Gemini");

    return JSON.parse(text) as BlueprintAnalysis;
  } catch (error) {
    console.error("Gemini Analysis Error:", error);
    throw error;
  }
}

export async function generateSpeech(text: string): Promise<string> {
  try {
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash-preview-tts",
      contents: [{ parts: [{ text }] }],
      config: {
        responseModalities: [Modality.AUDIO],
        speechConfig: {
          voiceConfig: {
            prebuiltVoiceConfig: { voiceName: 'Kore' },
          },
        },
      },
    });

    const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
    if (!base64Audio) throw new Error("No audio data returned from Gemini TTS");
    return base64Audio;
  } catch (error) {
    console.error("Gemini TTS Error:", error);
    throw error;
  }
}