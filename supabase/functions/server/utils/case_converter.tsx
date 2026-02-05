/**
 * 数据格式转换工具
 * 用于在数据库的 snake_case 和前端的 camelCase 之间转换
 */

/**
 * 将 snake_case 字符串转换为 camelCase
 */
function snakeToCamel(str: string): string {
  return str.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
}

/**
 * 将 camelCase 字符串转换为 snake_case
 */
function camelToSnake(str: string): string {
  return str.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`);
}

/**
 * 递归地将对象的键从 snake_case 转换为 camelCase
 */
export function toCamelCase(obj: any): any {
  if (obj === null || obj === undefined) {
    return obj;
  }

  if (Array.isArray(obj)) {
    return obj.map(item => toCamelCase(item));
  }

  if (typeof obj === 'object' && obj.constructor === Object) {
    const result: any = {};
    for (const key in obj) {
      if (obj.hasOwnProperty(key)) {
        const camelKey = snakeToCamel(key);
        result[camelKey] = toCamelCase(obj[key]);
      }
    }
    return result;
  }

  return obj;
}

/**
 * 递归地将对象的键从 camelCase 转换为 snake_case
 */
export function toSnakeCase(obj: any): any {
  if (obj === null || obj === undefined) {
    return obj;
  }

  if (Array.isArray(obj)) {
    return obj.map(item => toSnakeCase(item));
  }

  if (typeof obj === 'object' && obj.constructor === Object) {
    const result: any = {};
    for (const key in obj) {
      if (obj.hasOwnProperty(key)) {
        const snakeKey = camelToSnake(key);
        result[snakeKey] = toSnakeCase(obj[key]);
      }
    }
    return result;
  }

  return obj;
}

/**
 * 转换漫剧数据（包括嵌套的角色、剧集、分镜）
 */
export function transformSeriesData(data: any): any {
  return toCamelCase(data);
}
