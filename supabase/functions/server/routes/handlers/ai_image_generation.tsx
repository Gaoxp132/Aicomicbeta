/**
 * AI图像生成Handler
 * 从 routes_ai.tsx 提取
 * 负责：文生图（火山引擎、阿里云）和提示词优化
 */

import type { Context } from "npm:hono";
import { handleTextToImage } from "../../ai/text_to_image.tsx";
import { handlePolishImagePrompt } from "../../ai/prompt_polish.tsx";
import { handleAliyunTextToImage, handleAliyunTextToImageSync } from "../../ai/aliyun_tongyi.tsx";

/**
 * 火山引擎文生图
 */
export async function handleTextToImageWrapper(c: Context) {
  return handleTextToImage(c);
}

/**
 * 阿里云通义文生图（异步）
 */
export async function handleAliyunTextToImageWrapper(c: Context) {
  return handleAliyunTextToImage(c);
}

/**
 * 阿里云通义文生图（同步）
 */
export async function handleAliyunTextToImageSyncWrapper(c: Context) {
  return handleAliyunTextToImageSync(c);
}

/**
 * AI提示词优化
 */
export async function handlePolishImagePromptWrapper(c: Context) {
  return handlePolishImagePrompt(c);
}
