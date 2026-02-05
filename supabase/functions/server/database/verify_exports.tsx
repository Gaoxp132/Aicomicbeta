/**
 * 导出验证工具 - 用于调试
 * 验证所有导出都存在且可用
 */

// 验证 works.tsx 的导出
export async function verifyWorksExports() {
  console.log('[verify_exports] 🔍 Verifying works.tsx exports...');
  
  try {
    const works = await import('./works.tsx');
    
    const expectedExports = [
      'parseDuration',
      'getWorksInteractionCounts',
      'enrichWorksWithInteractions',
      'incrementViews',
      'incrementShares',
      'getCommunityWorks',
      'getUserWorks',
      'publishWork',
    ];
    
    const missingExports: string[] = [];
    const foundExports: string[] = [];
    
    for (const exportName of expectedExports) {
      if (typeof works[exportName] === 'function') {
        foundExports.push(exportName);
      } else {
        missingExports.push(exportName);
      }
    }
    
    console.log('[verify_exports] ✅ Found exports:', foundExports.join(', '));
    
    if (missingExports.length > 0) {
      console.error('[verify_exports] ❌ Missing exports:', missingExports.join(', '));
      return { success: false, missingExports };
    }
    
    // 检查不应该存在的导出
    const shouldNotExist = [
      'createWork',
      'getWork',
      'getAllWorks',
      'updateWork',
      'deleteWork',
      'incrementWorkViews',
      'getWorkWithInteractions',
      'getWorksWithInteractions',
    ];
    
    const unexpectedExports: string[] = [];
    for (const exportName of shouldNotExist) {
      if (works[exportName] !== undefined) {
        unexpectedExports.push(exportName);
      }
    }
    
    if (unexpectedExports.length > 0) {
      console.warn('[verify_exports] ⚠️ Unexpected exports found:', unexpectedExports.join(', '));
    }
    
    console.log('[verify_exports] ✅ All works.tsx exports verified!');
    return { 
      success: true, 
      foundExports, 
      unexpectedExports,
      total: foundExports.length 
    };
    
  } catch (error: any) {
    console.error('[verify_exports] ❌ Error verifying exports:', error.message);
    return { success: false, error: error.message };
  }
}

// 验证 video_tasks_crud.tsx 的导出
export async function verifyVideoTasksCrudExports() {
  console.log('[verify_exports] 🔍 Verifying video_tasks_crud.tsx exports...');
  
  try {
    const crud = await import('./video_tasks_crud.tsx');
    
    const expectedExports = [
      'createVideoTask',
      'getVideoTask',
      'getUserVideoTasks',
      'updateVideoTaskStatus',
      'updateVideoTaskThumbnail',
    ];
    
    const missingExports: string[] = [];
    const foundExports: string[] = [];
    
    for (const exportName of expectedExports) {
      if (typeof crud[exportName] === 'function') {
        foundExports.push(exportName);
      } else {
        missingExports.push(exportName);
      }
    }
    
    console.log('[verify_exports] ✅ Found exports:', foundExports.join(', '));
    
    if (missingExports.length > 0) {
      console.error('[verify_exports] ❌ Missing exports:', missingExports.join(', '));
      return { success: false, missingExports };
    }
    
    console.log('[verify_exports] ✅ All video_tasks_crud.tsx exports verified!');
    return { success: true, foundExports, total: foundExports.length };
    
  } catch (error: any) {
    console.error('[verify_exports] ❌ Error verifying exports:', error.message);
    return { success: false, error: error.message };
  }
}

// 验证 likes.tsx 的导出
export async function verifyLikesExports() {
  console.log('[verify_exports] 🔍 Verifying likes.tsx exports...');
  
  try {
    const likes = await import('./likes.tsx');
    
    const expectedExports = [
      'toggleLike',
      'getLikeStatus',
      'isLiked',
      'getLikesCount',
    ];
    
    const missingExports: string[] = [];
    const foundExports: string[] = [];
    
    for (const exportName of expectedExports) {
      if (typeof likes[exportName] === 'function') {
        foundExports.push(exportName);
      } else {
        missingExports.push(exportName);
      }
    }
    
    console.log('[verify_exports] ✅ Found exports:', foundExports.join(', '));
    
    if (missingExports.length > 0) {
      console.error('[verify_exports] ❌ Missing exports:', missingExports.join(', '));
      return { success: false, missingExports };
    }
    
    // 检查不应该存在的导出
    const shouldNotExist = ['getWorkLikes'];
    
    const unexpectedExports: string[] = [];
    for (const exportName of shouldNotExist) {
      if (likes[exportName] !== undefined) {
        unexpectedExports.push(exportName);
      }
    }
    
    if (unexpectedExports.length > 0) {
      console.warn('[verify_exports] ⚠️ Unexpected exports found:', unexpectedExports.join(', '));
    }
    
    console.log('[verify_exports] ✅ All likes.tsx exports verified!');
    return { 
      success: true, 
      foundExports, 
      unexpectedExports,
      total: foundExports.length 
    };
    
  } catch (error: any) {
    console.error('[verify_exports] ❌ Error verifying exports:', error.message);
    return { success: false, error: error.message };
  }
}

// 验证 comments.tsx 的导出
export async function verifyCommentsExports() {
  console.log('[verify_exports] 🔍 Verifying comments.tsx exports...');
  
  try {
    const comments = await import('./comments.tsx');
    
    const expectedExports = [
      'addComment',
      'getComments',
      'deleteComment',
    ];
    
    const missingExports: string[] = [];
    const foundExports: string[] = [];
    
    for (const exportName of expectedExports) {
      if (typeof comments[exportName] === 'function') {
        foundExports.push(exportName);
      } else {
        missingExports.push(exportName);
      }
    }
    
    console.log('[verify_exports] ✅ Found exports:', foundExports.join(', '));
    
    if (missingExports.length > 0) {
      console.error('[verify_exports] ❌ Missing exports:', missingExports.join(', '));
      return { success: false, missingExports };
    }
    
    // 检查不应该存在的导出
    const shouldNotExist = ['createComment', 'getWorkComments'];
    
    const unexpectedExports: string[] = [];
    for (const exportName of shouldNotExist) {
      if (comments[exportName] !== undefined) {
        unexpectedExports.push(exportName);
      }
    }
    
    if (unexpectedExports.length > 0) {
      console.warn('[verify_exports] ⚠️ Unexpected exports found:', unexpectedExports.join(', '));
    }
    
    console.log('[verify_exports] ✅ All comments.tsx exports verified!');
    return { 
      success: true, 
      foundExports, 
      unexpectedExports,
      total: foundExports.length 
    };
    
  } catch (error: any) {
    console.error('[verify_exports] ❌ Error verifying exports:', error.message);
    return { success: false, error: error.message };
  }
}

// 验证 series_interactions.tsx 的导出
export async function verifySeriesInteractionsExports() {
  console.log('[verify_exports] 🔍 Verifying series_interactions.tsx exports...');
  
  try {
    const seriesInt = await import('./series_interactions.tsx');
    
    const expectedExports = [
      'toggleSeriesLike',
      'getSeriesLikeStatus',
      'addSeriesComment',
      'getSeriesComments',
      'recordSeriesShare',
      'getSeriesSharesCount',
      'incrementSeriesViews',
      'getSeriesViews',
      'getSeriesInteractions',
      'upsertViewingHistory',
      'getViewingHistory',
      'getUserViewingHistoryList',
    ];
    
    const missingExports: string[] = [];
    const foundExports: string[] = [];
    
    for (const exportName of expectedExports) {
      if (typeof seriesInt[exportName] === 'function') {
        foundExports.push(exportName);
      } else {
        missingExports.push(exportName);
      }
    }
    
    console.log('[verify_exports] ✅ Found exports:', foundExports.join(', '));
    
    if (missingExports.length > 0) {
      console.error('[verify_exports] ❌ Missing exports:', missingExports.join(', '));
      return { success: false, missingExports };
    }
    
    // 检查不应该存在的导出
    const shouldNotExist = ['updateSeriesViewingHistory', 'getSeriesViewingHistory'];
    
    const unexpectedExports: string[] = [];
    for (const exportName of shouldNotExist) {
      if (seriesInt[exportName] !== undefined) {
        unexpectedExports.push(exportName);
      }
    }
    
    if (unexpectedExports.length > 0) {
      console.warn('[verify_exports] ⚠️ Unexpected exports found:', unexpectedExports.join(', '));
    }
    
    console.log('[verify_exports] ✅ All series_interactions.tsx exports verified!');
    return { 
      success: true, 
      foundExports, 
      unexpectedExports,
      total: foundExports.length 
    };
    
  } catch (error: any) {
    console.error('[verify_exports] ❌ Error verifying exports:', error.message);
    return { success: false, error: error.message };
  }
}

// 验证所有模块
export async function verifyAllExports() {
  console.log('[verify_exports] 🔍🔍🔍 Starting comprehensive export verification...');
  
  const results = {
    works: await verifyWorksExports(),
    videoTasksCrud: await verifyVideoTasksCrudExports(),
    likes: await verifyLikesExports(),
    comments: await verifyCommentsExports(),
    seriesInteractions: await verifySeriesInteractionsExports(),
  };
  
  const allSuccess = results.works.success && 
                     results.videoTasksCrud.success && 
                     results.likes.success && 
                     results.comments.success &&
                     results.seriesInteractions.success;
  
  if (allSuccess) {
    console.log('[verify_exports] ✅✅✅ ALL EXPORTS VERIFIED SUCCESSFULLY!');
  } else {
    console.error('[verify_exports] ❌❌❌ SOME EXPORTS FAILED VERIFICATION!');
  }
  
  return {
    success: allSuccess,
    details: results,
  };
}