/**
 * 安全错误处理工具
 * 
 * 用途：安全地提取和序列化错误对象，避免JSON序列化问题、循环引用等
 */

/**
 * 安全提取错误信息
 * @param error - Supabase或其他来源的错误对象
 * @param context - 错误上下文（用于日志前缀）
 * @returns 提取的错误信息对象
 */
export function extractErrorInfo(error: any, context = 'Error') {
  const errorInfo = {
    code: 'N/A',
    message: 'Unknown error',
    hint: 'N/A',
    details: 'No details available',
    fullError: '[Unable to serialize]',
  };

  try {
    if (error && typeof error === 'object') {
      // 提取code
      if ('code' in error && error.code) {
        errorInfo.code = String(error.code);
      }

      // 提取message - 特别小心处理
      if ('message' in error && error.message) {
        const msg = error.message;
        if (typeof msg === 'string') {
          errorInfo.message = msg;
        } else if (typeof msg === 'object') {
          try {
            // 🔧 使用安全序列化（处理循环引用）
            const seen = new WeakSet();
            errorInfo.message = JSON.stringify(msg, (key, value) => {
              if (value !== null && typeof value === 'object') {
                if (seen.has(value)) {
                  return '[Circular]';
                }
                seen.add(value);
              }
              return value;
            });
          } catch (jsonError) {
            // 如果序列化失败，尝试toString
            try {
              errorInfo.message = String(msg);
            } catch {
              errorInfo.message = '[Complex error object - cannot serialize]';
            }
          }
        } else {
          // 其他类型（number, boolean等）
          errorInfo.message = String(msg);
        }
      }

      // 提取hint
      if ('hint' in error && error.hint) {
        errorInfo.hint = String(error.hint);
      }

      // 提取details
      if ('details' in error && error.details) {
        const details = error.details;
        if (typeof details === 'string') {
          errorInfo.details = details;
        } else if (typeof details === 'object') {
          try {
            errorInfo.details = JSON.stringify(details, null, 2);
          } catch {
            errorInfo.details = '[Unable to serialize details]';
          }
        }
      }

      // 尝试序列化完整错误对象
      try {
        const seen = new WeakSet();
        errorInfo.fullError = JSON.stringify(error, (key, value) => {
          if (value !== null && typeof value === 'object') {
            if (seen.has(value)) {
              return '[Circular Reference]';
            }
            seen.add(value);
          }
          return value;
        }, 2);
      } catch {
        errorInfo.fullError = '[Unable to serialize full error]';
      }
    }
  } catch (extractError) {
    console.error(`❌ [${context}] Error during error extraction:`, 
      extractError instanceof Error ? extractError.message : 'Unknown extraction error');
  }

  return errorInfo;
}

/**
 * 记录错误信息到控制台
 * @param error - 错误对象
 * @param context - 错误上下文（用于日志前缀）
 * @param includeFullError - 是否包含完整错误对象（默认true）
 */
export function logError(error: any, context = 'Error', includeFullError = true) {
  const errorInfo = extractErrorInfo(error, context);

  console.error(`❌ [${context}] Error occurred`);
  console.error(`❌ [${context}] Error code: ${errorInfo.code}`);
  console.error(`❌ [${context}] Error message: ${errorInfo.message}`);
  console.error(`❌ [${context}] Error hint: ${errorInfo.hint}`);
  console.error(`❌ [${context}] Error details: ${errorInfo.details}`);

  if (includeFullError) {
    // 🔧 安全输出完整错误对象，避免截断问题
    try {
      console.error(`❌ [${context}] Full error object:`);
      // 分行输出，避免单行过长被截断
      const lines = errorInfo.fullError.split('\n');
      lines.forEach(line => console.error(`    ${line}`));
    } catch (logErr) {
      console.error(`❌ [${context}] Full error object: [Failed to log - ${logErr}]`);
    }
  }

  return errorInfo;
}

/**
 * 安全序列化任意对象（处理循环引用）
 * @param obj - 要序列化的对象
 * @param pretty - 是否格式化输出（默认false）
 * @returns 序列化后的字符串
 */
export function safeStringify(obj: any, pretty = false): string {
  try {
    const seen = new WeakSet();
    return JSON.stringify(obj, (key, value) => {
      if (value !== null && typeof value === 'object') {
        if (seen.has(value)) {
          return '[Circular Reference]';
        }
        seen.add(value);
      }
      return value;
    }, pretty ? 2 : 0);
  } catch (error) {
    return '[Unable to serialize object]';
  }
}

/**
 * 创建用户友好的错误消息
 * @param error - 错误对象
 * @param defaultMessage - 默认错误消息（当无法提取具体错误时使用）
 * @returns 用户友好的错误消息
 */
export function getUserFriendlyErrorMessage(error: any, defaultMessage = '操作失败'): string {
  const errorInfo = extractErrorInfo(error);
  
  // 如果有具体的错误消息，使用它
  if (errorInfo.message && errorInfo.message !== 'Unknown error') {
    return errorInfo.message;
  }
  
  // 如果有错误代码，返回带代码的消息
  if (errorInfo.code && errorInfo.code !== 'N/A') {
    return `${defaultMessage} (错误代码: ${errorInfo.code})`;
  }
  
  // 返回默认消息
  return defaultMessage;
}

/**
 * 判断是否为特定类型的数据库错误
 * @param error - 错误对象
 * @param code - 错误代码（如 'PGRST116', '23505'等）
 * @returns 是否匹配指定的错误代码
 */
export function isPostgresError(error: any, code: string): boolean {
  const errorInfo = extractErrorInfo(error);
  return errorInfo.code === code;
}

/**
 * 常见PostgreSQL错误代码
 */
export const PostgresErrorCodes = {
  UNIQUE_VIOLATION: '23505',        // 唯一约束冲突
  FOREIGN_KEY_VIOLATION: '23503',   // 外键约束冲突
  NOT_NULL_VIOLATION: '23502',      // 非空约束冲突
  CHECK_VIOLATION: '23514',         // 检查约束冲突
  NO_DATA: 'PGRST116',              // PostgREST: 查询结果为空
  MULTIPLE_ROWS: 'PGRST116',        // PostgREST: 期望单行但返回多行
} as const;