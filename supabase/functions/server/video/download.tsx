// 视频下载到Supabase Storage
import type { Context } from "npm:hono";
import { createClient } from "npm:@supabase/supabase-js@2";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

/**
 * 从火山引擎URL下载视频并保存到Supabase Storage
 */
export async function downloadAndStoreVideo(c: Context) {
  try {
    const body = await c.req.json();
    const { taskId, videoUrl } = body;
    
    if (!taskId || !videoUrl) {
      return c.json({ error: "Missing taskId or videoUrl" }, 400);
    }
    
    console.log(`[Download] Downloading video from Volcengine for task ${taskId}`);
    console.log(`[Download] URL: ${videoUrl.substring(0, 100)}...`);
    
    // 1. 从火山引擎下载视频
    const response = await fetch(videoUrl);
    
    if (!response.ok) {
      throw new Error(`Failed to download video: ${response.status} ${response.statusText}`);
    }
    
    const videoBlob = await response.blob();
    console.log(`[Download] Downloaded ${videoBlob.size} bytes`);
    
    // 2. 上传到Supabase Storage
    const bucketName = 'make-fc31472c-videos';
    const fileName = `${taskId}.mp4`;
    const filePath = `videos/${fileName}`;
    
    // 确保bucket存在
    const { data: buckets } = await supabase.storage.listBuckets();
    const bucketExists = buckets?.some(bucket => bucket.name === bucketName);
    
    if (!bucketExists) {
      console.log(`[Download] Creating bucket: ${bucketName}`);
      const { error: createError } = await supabase.storage.createBucket(bucketName, {
        public: false, // 私有bucket
        fileSizeLimit: 524288000, // 500MB
      });
      
      if (createError) {
        console.error('[Download] Failed to create bucket:', createError);
        throw createError;
      }
    }
    
    //3. 上传文件
    const arrayBuffer = await videoBlob.arrayBuffer();
    const { data: uploadData, error: uploadError } = await supabase.storage
      .from(bucketName)
      .upload(filePath, arrayBuffer, {
        contentType: 'video/mp4',
        upsert: true, // 覆盖已存在的文件
      });
    
    if (uploadError) {
      console.error('[Download] Failed to upload video:', uploadError);
      throw uploadError;
    }
    
    console.log(`[Download] Uploaded to: ${filePath}`);
    
    // 4. 生成签名URL（7天有效期）
    const { data: signedUrlData, error: signedUrlError } = await supabase.storage
      .from(bucketName)
      .createSignedUrl(filePath, 604800); // 7天 = 604800秒
    
    if (signedUrlError) {
      console.error('[Download] Failed to create signed URL:', signedUrlError);
      throw signedUrlError;
    }
    
    const permanentUrl = signedUrlData.signedUrl;
    console.log(`[Download] Generated signed URL (7 days): ${permanentUrl.substring(0, 100)}...`);
    
    return c.json({
      success: true,
      data: {
        taskId,
        originalUrl: videoUrl,
        storedUrl: permanentUrl,
        storagePath: filePath,
        bucketName,
        expiresIn: '7 days',
      },
    });
  } catch (error: any) {
    console.error('[Download] Error:', error);
    return c.json({
      success: false,
      error: error.message || 'Failed to download and store video',
    }, 500);
  }
}
