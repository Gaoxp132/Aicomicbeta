// 阿里云OSS上传工具
import { encode as base64Encode } from "https://deno.land/std@0.177.0/encoding/base64.ts";

/**
 * 阿里云OSS配置
 */
interface OSSConfig {
  accessKeyId: string;
  accessKeySecret: string;
  endpoint: string;
  bucketName: string;
  region: string;
}

/**
 * 获取阿里云OSS配置
 */
function getOSSConfig(): OSSConfig {
  const accessKeyId = Deno.env.get('ALIYUN_OSS_ACCESS_KEY_ID');
  const accessKeySecret = Deno.env.get('ALIYUN_OSS_ACCESS_KEY_SECRET');
  const endpoint = Deno.env.get('ALIYUN_OSS_ENDPOINT');
  const bucketName = Deno.env.get('ALIYUN_OSS_BUCKET_NAME');
  let region = Deno.env.get('ALIYUN_OSS_REGION') || 'cn-shenzhen'; // ✅ 修复：默认使用不带oss-前缀的格式

  // ✅ endpoint是可选的（用于自定义域名），只检查必需参数
  if (!accessKeyId || !accessKeySecret || !bucketName) {
    throw new Error('Missing Aliyun OSS configuration. Please set ALIYUN_OSS_ACCESS_KEY_ID, ALIYUN_OSS_ACCESS_KEY_SECRET, and ALIYUN_OSS_BUCKET_NAME environment variables.');
  }

  // 🔧 规范化region格式：统一使用不带oss-前缀的格式存储
  // 环境变量应该配置为：cn-shenzhen, cn-beijing, us-west-1 等
  // 如果错误配置了oss-前缀，自动移除
  if (region.startsWith('oss-')) {
    const oldRegion = region;
    region = region.replace(/^oss-/, '');
    console.log(`[OSS Config] 🔧 Removed oss- prefix from region: \"${oldRegion}\" -> \"${region}\"`);
  }
  
  // 验证region格式（应该匹配：cn-shenzhen, us-west-1, ap-southeast-1 等）
  if (!region.match(/^(cn|us|ap|eu)-[a-z0-9-]+$/)) {
    console.warn(`[OSS Config] ⚠️ Unusual region format: \"${region}\"`);
    
    // 尝试从endpoint中提取region
    if (endpoint && endpoint.includes('oss-')) {
      const match = endpoint.match(/oss-([a-z0-9-]+)\\.aliyuncs\\.com/);
      if (match) {
        region = match[1];  // 提取不带oss-前缀的部分
        console.log(`[OSS Config] 🔧 Extracted region from endpoint: ${region}`);
      } else {
        console.warn(`[OSS Config] ⚠️ Could not extract region from endpoint, using default: cn-shenzhen`);
        region = 'cn-shenzhen';
      }
    } else {
      console.warn(`[OSS Config] ⚠️ Using default region: cn-shenzhen`);
      region = 'cn-shenzhen';
    }
  }

  console.log('[OSS Config] Final configuration:', {
    hasAccessKeyId: !!accessKeyId,
    hasAccessKeySecret: !!accessKeySecret,
    bucketName,
    region,
    endpoint: endpoint || '(使用标准endpoint)',
  });

  return {
    accessKeyId,
    accessKeySecret,
    endpoint: endpoint || '', // 如果没有设置endpoint，使用空字符串
    bucketName,
    region,
  };
}

/**
 * 生成阿里云OSS签名
 */
async function generateSignature(
  method: string,
  contentMD5: string,
  contentType: string,
  date: string,
  ossHeaders: Record<string, string>,
  resource: string,
  accessKeySecret: string
): Promise<string> {
  // 规范化OSS头部
  const canonicalizedOSSHeadersList = Object.keys(ossHeaders)
    .filter(key => key.toLowerCase().startsWith('x-oss-'))
    .sort()
    .map(key => `${key.toLowerCase()}:${ossHeaders[key]}`);
  
  const canonicalizedOSSHeaders = canonicalizedOSSHeadersList.length > 0 
    ? canonicalizedOSSHeadersList.join('\n') + '\n'
    : '';

  // 构建签名字符串
  // 阿里云OSS签名格式（RFC规定）：
  // VERB + "\n" + Content-MD5 + "\n" + Content-Type + "\n" + Date + "\n" + CanonicalizedOSSHeaders + CanonicalizedResource
  const stringToSign = method + '\n' +
    contentMD5 + '\n' +
    contentType + '\n' +
    date + '\n' +
    canonicalizedOSSHeaders +
    resource;

  console.log('[OSS Signature] String to sign:', stringToSign);
  console.log('[OSS Signature] Access Key Secret (first 4 chars):', accessKeySecret.substring(0, 4) + '...');

  // 使用HMAC-SHA1生成签名
  const encoder = new TextEncoder();
  const keyData = encoder.encode(accessKeySecret);
  const messageData = encoder.encode(stringToSign);
  
  // 使用Web Crypto API生成HMAC-SHA1
  return crypto.subtle.importKey(
    'raw',
    keyData,
    { name: 'HMAC', hash: 'SHA-1' },
    false,
    ['sign']
  ).then(key => {
    return crypto.subtle.sign('HMAC', key, messageData);
  }).then(signature => {
    const signatureArray = new Uint8Array(signature);
    const base64Sig = base64Encode(signatureArray);
    console.log('[OSS Signature] Generated signature:', base64Sig);
    return base64Sig;
  });
}

/**
 * 上传文件到阿里云OSS
 */
export async function uploadToOSS(
  fileData: Uint8Array,
  fileName: string,
  contentType: string = 'video/mp4',
  userId?: string  // 新增：用户ID（可选）
): Promise<string> {
  const config = getOSSConfig();
  
  // 🔧 新增：所有文件都在aicomic/目录下
  const basePrefix = 'aicomic';
  
  // 构建对象路径，按用户和时间组织目录结构
  let objectPath: string;
  
  if (userId) {
    // 如果提供了用户ID，按用户和日期创建子目录
    // 格式: aicomic/video-doubao/用户ID/2026/01/19/文件名.mp4
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    
    objectPath = `${basePrefix}/video-doubao/${userId}/${year}/${month}/${day}/${fileName}`;
    console.log('[OSS] Using organized path with user and date:', objectPath);
  } else {
    // 如果没有提供用户ID，使用原来的简单路径
    objectPath = `${basePrefix}/video-doubao/${fileName}`;
    console.log('[OSS] Using simple path (no user ID):', objectPath);
  }
  
  const resource = `/${config.bucketName}/${objectPath}`;
  
  // 准备请求
  const date = new Date().toUTCString();
  const method = 'PUT';
  const contentMD5 = '';
  const ossHeaders: Record<string, string> = {};
  
  // 生成签名
  const signature = await generateSignature(
    method,
    contentMD5,
    contentType,
    date,
    ossHeaders,
    resource,
    config.accessKeySecret
  );
  
  // 构建完整URL
  // 使用内部endpoint（oss-cn-shenzhen.aliyuncs.com）而不是自定义域名
  // 🔧 确保region格式正确：如果已包含oss-前缀则使用，否则添加
  const regionPart = config.region.startsWith('oss-') ? config.region : `oss-${config.region}`;
  const internalEndpoint = `${regionPart}.aliyuncs.com`;
  const uploadUrl = `https://${config.bucketName}.${internalEndpoint}/${objectPath}`;
  
  console.log('[OSS] Uploading to:', uploadUrl);
  console.log('[OSS] File size:', fileData.length, 'bytes');
  
  // 上传文件
  const response = await fetch(uploadUrl, {
    method: 'PUT',
    headers: {
      'Date': date,
      'Content-Type': contentType,
      'Authorization': `OSS ${config.accessKeyId}:${signature}`,
    },
    body: fileData,
  });
  
  if (!response.ok) {
    const errorText = await response.text();
    console.error('[OSS] Upload failed:', response.status, errorText);
    throw new Error(`Failed to upload to OSS: ${response.status} ${errorText}`);
  }
  
  console.log('[OSS] Upload successful!');
  
  // 返回普通URL（前端会在需要时请求签名）
  // 格式: https://bucket-name.oss-region.aliyuncs.com/path
  const publicAccessUrl = `https://${config.bucketName}.${internalEndpoint}/${objectPath}`;
  console.log('[OSS] Public Access URL:', publicAccessUrl);
  
  // 如果endpoint是自定义域名（不包含aliyuncs.com），则使用自定义域名
  const isCustomDomain = config.endpoint && !config.endpoint.includes('aliyuncs.com');
  const accessUrl = isCustomDomain 
    ? `https://${config.endpoint}/${objectPath}`
    : publicAccessUrl;
  
  console.log('[OSS] Final Access URL:', accessUrl);
  console.log('[OSS] Using custom domain:', isCustomDomain);
  
  return accessUrl;
}

/**
 * 从火山引擎URL下载视频并上传到阿里云OSS
 */
export async function transferVideoToOSS(
  taskId: string,
  volcengineUrl: string,
  userId?: string  // 新增：用户ID（可选）
): Promise<{ success: boolean; ossUrl?: string; error?: string }> {
  try {
    console.log('[OSS Transfer] Starting transfer for task:', taskId);
    console.log('[OSS Transfer] Source URL:', volcengineUrl.substring(0, 100) + '...');
    if (userId) {
      console.log('[OSS Transfer] User ID:', userId);
    }
    
    // ✅ 先检查OSS配置是否正确
    try {
      const config = getOSSConfig();
      console.log('[OSS Transfer] OSS Config:', {
        hasAccessKeyId: !!config.accessKeyId,
        hasAccessKeySecret: !!config.accessKeySecret,
        endpoint: config.endpoint || '(使用标准endpoint)',
        bucketName: config.bucketName,
        region: config.region,
      });
      
      // 验证bucket名称格式
      if (!config.bucketName || config.bucketName.length < 3) {
        throw new Error('Invalid bucket name: must be at least 3 characters');
      }
      
      // 验证region格式
      if (!config.region.startsWith('cn-') && !config.region.startsWith('us-')) {
        console.warn('[OSS Transfer] ⚠️ Unusual region format:', config.region);
      }
    } catch (configError: any) {
      console.error('[OSS Transfer] ❌ OSS configuration error:', configError.message);
      return {
        success: false,
        error: `OSS配置错误: ${configError.message}`,
      };
    }
    
    // 🔍 检测文件类型（视频或图片）
    const isImage = volcengineUrl.match(/\.(jpg|jpeg|png|webp|gif)(\?|$)/i) !== null;
    const fileExtension = isImage 
      ? (volcengineUrl.match(/\.(jpg|jpeg|png|webp|gif)/i)?.[0] || '.jpg')
      : '.mp4';
    const contentType = isImage ? 'image/jpeg' : 'video/mp4';
    
    console.log('[OSS Transfer] 🔍 Detected file type:', isImage ? 'IMAGE' : 'VIDEO');
    console.log('[OSS Transfer] File extension:', fileExtension);
    console.log('[OSS Transfer] Content-Type:', contentType);
    
    // 1. 从火山引擎下载视频
    console.log('[OSS Transfer] Downloading from Volcengine...');
    
    // ✅ 添加超时和重试机制
    let downloadResponse: Response | null = null;
    let retryCount = 0;
    const maxRetries = 3;
    const downloadTimeout = 60000; // 60秒超时
    
    while (retryCount < maxRetries) {
      try {
        console.log(`[OSS Transfer] Download attempt ${retryCount + 1}/${maxRetries}...`);
        
        // 使用AbortController实现超时
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), downloadTimeout);
        
        downloadResponse = await fetch(volcengineUrl, {
          signal: controller.signal,
          headers: {
            'User-Agent': 'Mozilla/5.0 (compatible; VideoBot/1.0)',
          },
        });
        
        clearTimeout(timeoutId);
        
        if (!downloadResponse.ok) {
          throw new Error(`HTTP ${downloadResponse.status}: ${downloadResponse.statusText}`);
        }
        
        // 下载成功，跳出循环
        break;
      } catch (downloadError: any) {
        retryCount++;
        console.error(`[OSS Transfer] Download attempt ${retryCount} failed:`, downloadError.message);
        
        if (retryCount >= maxRetries) {
          throw new Error(`Failed to download after ${maxRetries} attempts: ${downloadError.message}`);
        }
        
        // 等待后重试
        const waitTime = Math.min(2000 * retryCount, 10000); // 2s, 4s, 6s...
        console.log(`[OSS Transfer] Waiting ${waitTime}ms before retry...`);
        await new Promise(resolve => setTimeout(resolve, waitTime));
      }
    }
    
    if (!downloadResponse) {
      throw new Error('Download failed: no response received');
    }
    
    const videoData = new Uint8Array(await downloadResponse.arrayBuffer());
    console.log('[OSS Transfer] Downloaded', videoData.length, 'bytes');
    
    // 2. 上传到阿里云OSS，传入用户ID以组织目录结构
    const fileName = `${taskId}${fileExtension}`;  // ✅ 使用正确的文件后缀
    console.log('[OSS Transfer] Uploading to Aliyun OSS as:', fileName);
    
    const ossUrl = await uploadToOSS(videoData, fileName, contentType, userId);  // ✅ 使用正确的Content-Type
    
    console.log('[OSS Transfer] ✅ Transfer complete! OSS URL:', ossUrl);
    
    return {
      success: true,
      ossUrl,
    };
  } catch (error: any) {
    console.error('[OSS Transfer] ❌ Transfer failed:', error.message);
    console.error('[OSS Transfer] Error details:', {
      name: error.name,
      message: error.message,
      stack: error.stack?.substring(0, 200),
    });
    
    return {
      success: false,
      error: error.message,
    };
  }
}

/**
 * 生成阿里云OSS签名URL（用于私有bucket访问）
 * @param objectPath - OSS对象路径（不包含bucket名称）
 * @param expiresInSeconds - URL过期时间（秒），默认1小时
 */
export async function generateSignedUrl(
  objectPath: string,
  expiresInSeconds: number = 3600
): Promise<string> {
  const config = getOSSConfig();
  
  // 🔧 确保objectPath不以/开头（OSS要求）
  const cleanPath = objectPath.startsWith('/') ? objectPath.substring(1) : objectPath;
  
  // 计算过期时间戳
  const expires = Math.floor(Date.now() / 1000) + expiresInSeconds;
  
  // 构建签名字符串（注意：这里使用expires时间戳代替Date）
  const method = 'GET';
  const contentMD5 = '';
  const contentType = '';
  const canonicalizedOSSHeaders = '';
  const canonicalizedResource = `/${config.bucketName}/${cleanPath}`;
  
  const stringToSign = method + '\n' +
    contentMD5 + '\n' +
    contentType + '\n' +
    expires + '\n' +
    canonicalizedOSSHeaders +
    canonicalizedResource;
  
  console.log('[OSS Signed URL] String to sign:', stringToSign);
  console.log('[OSS Signed URL] Resource:', canonicalizedResource);
  console.log('[OSS Signed URL] Expires:', expires, '(', new Date(expires * 1000).toISOString(), ')');
  
  // 生成签名
  const encoder = new TextEncoder();
  const keyData = encoder.encode(config.accessKeySecret);
  const messageData = encoder.encode(stringToSign);
  
  const key = await crypto.subtle.importKey(
    'raw',
    keyData,
    { name: 'HMAC', hash: 'SHA-1' },
    false,
    ['sign']
  );
  
  const signature = await crypto.subtle.sign('HMAC', key, messageData);
  const signatureArray = new Uint8Array(signature);
  const base64Sig = base64Encode(signatureArray);
  
  console.log('[OSS Signed URL] Signature:', base64Sig.substring(0, 20) + '...');
  
  // 🔧 构建签名URL - 使用标准OSS endpoint
  // 确保region格式正确：如果已包含oss-前缀则使用，否则添加
  const regionPart = config.region.startsWith('oss-') ? config.region : `oss-${config.region}`;
  const internalEndpoint = `${regionPart}.aliyuncs.com`;
  const baseUrl = `https://${config.bucketName}.${internalEndpoint}/${cleanPath}`;
  const signedUrl = `${baseUrl}?OSSAccessKeyId=${encodeURIComponent(config.accessKeyId)}&Expires=${expires}&Signature=${encodeURIComponent(base64Sig)}`;
  
  console.log('[OSS Signed URL] Base URL:', baseUrl);
  console.log('[OSS Signed URL] Generated signed URL (expires in', expiresInSeconds, 'seconds)');
  console.log('[OSS Signed URL] Full URL:', signedUrl.substring(0, 150) + '...');
  
  return signedUrl;
}

/**
 * 🆕 生成阿里云OSS签名URL（支持自定义bucket）
 * 用于签名来自不同bucket的URL（例如旧bucket中的视频）
 * @param objectPath - OSS对象路径（不包含bucket名称）
 * @param bucketName - Bucket名称（覆盖环境变量配置）
 * @param expiresInSeconds - URL过期时间（秒），默认1小时
 */
export async function generateSignedUrlForBucket(
  objectPath: string,
  bucketName: string,
  expiresInSeconds: number = 3600
): Promise<string> {
  const config = getOSSConfig();
  
  // 🔧 确保objectPath不以/开头（OSS要求）
  const cleanPath = objectPath.startsWith('/') ? objectPath.substring(1) : objectPath;
  
  // 计算过期时间戳
  const expires = Math.floor(Date.now() / 1000) + expiresInSeconds;
  
  // 构建签名字符串（使用指定的bucket）
  const method = 'GET';
  const contentMD5 = '';
  const contentType = '';
  const canonicalizedOSSHeaders = '';
  const canonicalizedResource = `/${bucketName}/${cleanPath}`;
  
  const stringToSign = method + '\n' +
    contentMD5 + '\n' +
    contentType + '\n' +
    expires + '\n' +
    canonicalizedOSSHeaders +
    canonicalizedResource;
  
  console.log('[OSS Signed URL] Using custom bucket:', bucketName);
  console.log('[OSS Signed URL] String to sign:', stringToSign);
  console.log('[OSS Signed URL] Resource:', canonicalizedResource);
  
  // 生成签名
  const encoder = new TextEncoder();
  const keyData = encoder.encode(config.accessKeySecret);
  const messageData = encoder.encode(stringToSign);
  
  const key = await crypto.subtle.importKey(
    'raw',
    keyData,
    { name: 'HMAC', hash: 'SHA-1' },
    false,
    ['sign']
  );
  
  const signature = await crypto.subtle.sign('HMAC', key, messageData);
  const signatureArray = new Uint8Array(signature);
  const base64Sig = base64Encode(signatureArray);
  
  console.log('[OSS Signed URL] Signature:', base64Sig.substring(0, 20) + '...');
  
  // 🔧 构建签名URL - 使用指定的bucket
  // 确保region格式正确：如果已包含oss-前缀则使用，否则添加
  const regionPart = config.region.startsWith('oss-') ? config.region : `oss-${config.region}`;
  const internalEndpoint = `${regionPart}.aliyuncs.com`;
  const baseUrl = `https://${bucketName}.${internalEndpoint}/${cleanPath}`;
  const signedUrl = `${baseUrl}?OSSAccessKeyId=${encodeURIComponent(config.accessKeyId)}&Expires=${expires}&Signature=${encodeURIComponent(base64Sig)}`;
  
  console.log('[OSS Signed URL] Base URL:', baseUrl);
  console.log('[OSS Signed URL] Generated signed URL for bucket', bucketName, '(expires in', expiresInSeconds, 'seconds)');
  
  return signedUrl;
}