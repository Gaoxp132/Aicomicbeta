// 图片上传和处理功能
import type { Context } from "npm:hono";
import { createClient } from "npm:@supabase/supabase-js@2";
import { API_CONFIG } from "./constants.tsx";

interface ImageUploadResult {
  success: boolean;
  publicUrls: string[];
  error?: string;
}

/**
 * 上传Base64图片到Supabase Storage
 */
export async function uploadImagesToStorage(imageUrls: string[]): Promise<ImageUploadResult> {
  if (!imageUrls || !Array.isArray(imageUrls) || imageUrls.length === 0) {
    return { success: true, publicUrls: [] };
  }

  console.log(`Processing ${imageUrls.length} images...`);

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
  );

  // 确保bucket存在
  const { data: buckets } = await supabase.storage.listBuckets();
  const bucketExists = buckets?.some(bucket => bucket.name === API_CONFIG.BUCKET_NAME);
  
  if (!bucketExists) {
    console.log(`Creating bucket: ${API_CONFIG.BUCKET_NAME}`);
    const { error: createError } = await supabase.storage.createBucket(API_CONFIG.BUCKET_NAME, {
      public: true,
    });
    if (createError) {
      console.error("Failed to create bucket:", createError);
      return {
        success: false,
        publicUrls: [],
        error: "创建图片存储失败",
      };
    }
  }

  const publicUrls: string[] = [];

  // 上传每张图片
  for (let i = 0; i < imageUrls.length; i++) {
    const imageUrl = imageUrls[i];
    console.log(`Uploading image ${i + 1}/${imageUrls.length}...`);

    try {
      if (!imageUrl.startsWith('data:image/')) {
        console.error(`Invalid image format at index ${i}`);
        continue;
      }

      const base64Data = imageUrl.split(',')[1];
      const mimeType = imageUrl.split(';')[0].split(':')[1];
      const extension = mimeType.split('/')[1];
      const binaryData = Uint8Array.from(atob(base64Data), c => c.charCodeAt(0));
      const fileName = `${Date.now()}-${i}.${extension}`;
      const filePath = fileName;

      console.log(`Uploading to Supabase Storage: ${filePath}, size: ${binaryData.length} bytes`);

      const { data: uploadData, error: uploadError } = await supabase.storage
        .from(API_CONFIG.BUCKET_NAME)
        .upload(filePath, binaryData, {
          contentType: mimeType,
          upsert: true,
        });

      if (uploadError) {
        console.error(`Failed to upload image ${i}:`, uploadError);
        continue;
      }

      console.log(`Upload successful: ${uploadData.path}`);

      const { data: urlData } = supabase.storage
        .from(API_CONFIG.BUCKET_NAME)
        .getPublicUrl(filePath);

      const publicUrl = urlData.publicUrl;
      console.log(`Public URL: ${publicUrl}`);

      publicUrls.push(publicUrl);
    } catch (uploadErr: any) {
      console.error(`Error processing image ${i}:`, uploadErr.message);
      console.error("Stack:", uploadErr.stack);
    }
  }

  console.log(`Successfully uploaded ${publicUrls.length}/${imageUrls.length} images`);
  console.log("Public URLs:", publicUrls);

  return {
    success: true,
    publicUrls,
  };
}

/**
 * 构建视频生成的content数组
 * @param publicImageUrls - 图片URL数组
 * @param stylePrompt - 风格提示词
 * @param userPrompt - 用户输入的故事描述
 * @param duration - 视频时长（秒）
 * @param maxImagesAllowed - 最多允许的图片数量（默认6）
 */
export function buildContentArray(
  publicImageUrls: string[],
  stylePrompt: string,
  userPrompt: string,
  duration: number = 5,
  maxImagesAllowed: number = 6
): any[] {
  const content: any[] = [];

  // ✅ 根据火山引擎官方文档：text 必须在 image_url 之前
  // 🔧 构建完整的提示词：用户描述 + 风格（不包含duration，duration是独立参数）
  const fullPrompt = `${userPrompt}，${stylePrompt}`;
  console.log(`Full prompt: ${fullPrompt}`);
  console.log(`Duration parameter: ${duration} seconds`);

  // 1️⃣ 先添加文本提示词（必须在图片之前）
  // ⚠️ 重要：duration是text对象的独立属性，���是prompt字符串的一部分
  content.push({
    type: "text",
    text: fullPrompt,
    duration: duration, // ✅ duration作为独立参数
  });

  // 2️⃣ 再添加图片（如果有）
  if (publicImageUrls.length > 0) {
    const imagesToUse = Math.min(publicImageUrls.length, maxImagesAllowed);
    console.log(`Adding ${imagesToUse} image(s) to content (max allowed: ${maxImagesAllowed})`);

    if (imagesToUse === 1) {
      // 单张图片：图生视频模式
      content.push({
        type: "image_url",
        image_url: {
          url: publicImageUrls[0],
        },
      });
      console.log(`  Image 1/1 (i2v mode): ${publicImageUrls[0]}`);
    } else if (imagesToUse === 2) {
      // 两张图片：首尾帧模式
      content.push({
        type: "image_url",
        image_url: {
          url: publicImageUrls[0],
        },
        role: "first_frame",
      });
      console.log(`  Image 1/2 (first_frame): ${publicImageUrls[0]}`);

      content.push({
        type: "image_url",
        image_url: {
          url: publicImageUrls[1],
        },
        role: "last_frame",
      });
      console.log(`  Image 2/2 (last_frame): ${publicImageUrls[1]}`);
    } else if (imagesToUse > 2) {
      // 多张图片：参考图模式
      for (let i = 0; i < imagesToUse; i++) {
        content.push({
          type: "image_url",
          image_url: {
            url: publicImageUrls[i],
          },
          role: "reference",
        });
        console.log(`  Image ${i + 1}/${imagesToUse} (reference): ${publicImageUrls[i]}`);
      }
    }

    if (publicImageUrls.length > maxImagesAllowed) {
      console.warn(`⚠️ Warning: ${publicImageUrls.length} images uploaded, but only first ${maxImagesAllowed} will be used`);
    }
  }

  console.log(`✅ Content array built: ${content.length} items (1 text + ${content.length - 1} images)`);
  return content;
}