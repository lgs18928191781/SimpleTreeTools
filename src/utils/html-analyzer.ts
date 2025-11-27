/**
 * HTML 分析工具
 * 用于解析 HTML 文件并提取外部资源
 */

export interface ResourceInfo {
  url: string
  type: 'script' | 'stylesheet' | 'other'
  originalTag: 'script' | 'link'
}

export interface DownloadedResource {
  name: string
  path: string
  size: number
  blob: Blob
  url: string // blob URL
  type: string
}

/**
 * 从 HTML 内容中提取外部资源
 */
export function extractResourcesFromHTML(htmlContent: string): ResourceInfo[] {
  const resources: ResourceInfo[] = []
  
  // 提取 <head> 标签内容
  const headMatch = htmlContent.match(/<head[^>]*>([\s\S]*?)<\/head>/i)
  if (!headMatch) {
    return resources
  }
  
  const headContent = headMatch[1]
  
  // 提取 script 标签（只处理有 src 属性的）
  const scriptRegex = /<script[^>]*src\s*=\s*["']([^"']+)["'][^>]*>/gi
  let scriptMatch
  while ((scriptMatch = scriptRegex.exec(headContent)) !== null) {
    // 确保匹配到的是有 src 属性的 script 标签
    const fullMatch = scriptMatch[0]
    if (fullMatch.includes('src=')) {
      resources.push({
        url: scriptMatch[1],
        type: 'script',
        originalTag: 'script'
      })
    }
  }
  
  // 提取 link 标签（主要是 stylesheet）
  const linkRegex = /<link[^>]*href\s*=\s*["']([^"']+)["'][^>]*>/gi
  let linkMatch
  while ((linkMatch = linkRegex.exec(headContent)) !== null) {
    const relMatch = linkMatch[0].match(/rel\s*=\s*["']([^"']+)["']/i)
    const rel = relMatch ? relMatch[1].toLowerCase() : ''
    
    // 主要关注 stylesheet，但也可以下载其他资源
    const type = rel === 'stylesheet' ? 'stylesheet' : 'other'
    
    resources.push({
      url: linkMatch[1],
      type,
      originalTag: 'link'
    })
  }
  
  return resources
}

/**
 * 从 URL 中提取文件名
 * 使用路径的最后两个段拼接作为文件名，避免冲突
 */
export function getFileNameFromUrl(url: string, resourceType?: 'script' | 'stylesheet' | 'other'): string {
  try {
    // 如果是完整 URL，提取路径部分
    const urlObj = new URL(url, window.location.href)
    const pathname = urlObj.pathname
    const pathParts = pathname.split('/').filter(p => p) // 过滤空字符串
    
    let fileName: string
    
    // 使用最后两个路径段拼接作为文件名
    if (pathParts.length >= 2) {
      const lastPart = pathParts[pathParts.length - 1] // 最后一段（通常是文件名）
      const secondLastPart = pathParts[pathParts.length - 2] // 倒数第二段（通常是包名/版本）
      
      // 处理特殊 CDN URL（如 jsdelivr 的 +esm）
      if (lastPart === '+esm' || lastPart.startsWith('+')) {
        // 如果最后一段是特殊标记，使用倒数第二段和倒数第三段
        if (pathParts.length >= 3) {
          const thirdLastPart = pathParts[pathParts.length - 3]
          fileName = `${thirdLastPart}-${secondLastPart}.js`
        } else {
          fileName = `${secondLastPart}.js`
        }
      } else {
        // 拼接最后两个段：包名-文件名
        fileName = `${secondLastPart}-${lastPart}`
      }
    } else if (pathParts.length === 1) {
      // 只有一个路径段
      fileName = pathParts[0]
    } else {
      // 没有路径段，使用默认名称
      fileName = 'file'
    }
    
    // 如果没有扩展名，尝试从 URL 或资源类型推断
    if (!fileName.includes('.')) {
      // 根据 URL 路径推断类型
      if (pathname.includes('.js') || url.includes('.js')) {
        fileName = `${fileName}.js`
      } else if (pathname.includes('.css') || url.includes('.css')) {
        fileName = `${fileName}.css`
      } else if (resourceType === 'script') {
        fileName = `${fileName}.js`
      } else if (resourceType === 'stylesheet') {
        fileName = `${fileName}.css`
      } else {
        fileName = `${fileName}.js` // 默认为 js
      }
    }
    
    // 清理文件名中的特殊字符（保留连字符和点）
    fileName = fileName.replace(/[<>:"/\\|?*@]/g, '_')
    
    return fileName
  } catch {
    // 如果不是完整 URL，直接使用路径
    const parts = url.split('/').filter(p => p)
    
    let fileName: string
    
    // 使用最后两个路径段拼接
    if (parts.length >= 2) {
      const lastPart = parts[parts.length - 1]
      const secondLastPart = parts[parts.length - 2]
      
      // 处理特殊后缀
      if (lastPart === '+esm' || lastPart.startsWith('+')) {
        if (parts.length >= 3) {
          const thirdLastPart = parts[parts.length - 3]
          fileName = `${thirdLastPart}-${secondLastPart}.js`
        } else {
          fileName = `${secondLastPart}.js`
        }
      } else {
        fileName = `${secondLastPart}-${lastPart}`
      }
    } else if (parts.length === 1) {
      fileName = parts[0]
    } else {
      fileName = 'file'
    }
    
    // 如果没有扩展名，根据资源类型添加
    if (!fileName.includes('.')) {
      fileName = resourceType === 'stylesheet' ? `${fileName}.css` : `${fileName}.js`
    }
    
    // 清理文件名（保留连字符和点）
    fileName = fileName.replace(/[<>:"/\\|?*@]/g, '_')
    
    return fileName
  }
}

/**
 * 下载资源
 */
export async function downloadResource(
  url: string,
  baseUrl?: string,
  resourceType?: 'script' | 'stylesheet' | 'other'
): Promise<DownloadedResource> {
  try {
    // 构建完整 URL
    let fullUrl = url
    
    // 如果是相对路径，需要构建完整 URL
    if (!url.startsWith('http://') && !url.startsWith('https://') && !url.startsWith('//') && !url.startsWith('data:')) {
      // 如果是 CDN 或公共资源，尝试直接使用
      if (url.startsWith('/')) {
        // 绝对路径，尝试从常见 CDN 获取
        // 这里可以根据实际情况调整
        fullUrl = url
      } else if (baseUrl) {
        try {
          // 尝试使用 baseUrl 构建完整 URL
          // 由于 baseUrl 可能是 file:// 协议，我们需要特殊处理
          if (baseUrl.startsWith('file://')) {
            // 对于 file:// 协议，我们无法直接下载
            // 尝试将相对路径转换为可能的 CDN 路径
            // 或者跳过本地文件引用
            throw new Error('无法下载本地文件引用')
          }
          const base = new URL(baseUrl)
          fullUrl = new URL(url, base).href
        } catch {
          // 如果 baseUrl 无效，尝试直接拼接
          fullUrl = baseUrl.replace(/\/$/, '') + '/' + url.replace(/^\//, '')
        }
      }
    }
    
    // 处理协议相对 URL (//example.com)
    if (fullUrl.startsWith('//')) {
      fullUrl = window.location.protocol + fullUrl
    }
    
    // 跳过 data: URL
    if (fullUrl.startsWith('data:')) {
      throw new Error('不支持 data: URL')
    }
    
    // 下载资源
    const response = await fetch(fullUrl, {
      mode: 'cors',
      credentials: 'omit',
      cache: 'no-cache'
    })
    
    if (!response.ok) {
      throw new Error(`下载失败: ${response.status} ${response.statusText}`)
    }
    
    const blob = await response.blob()
    
    // 从 URL 中提取资源类型（用于确定文件扩展名）
    const resourceType = url.includes('.css') || blob.type.includes('css') 
      ? 'stylesheet' 
      : url.includes('.js') || blob.type.includes('javascript')
      ? 'script'
      : 'other'
    
    const fileName = getFileNameFromUrl(url, resourceType)
    const blobUrl = URL.createObjectURL(blob)
    
    return {
      name: fileName,
      path: `/src/${fileName}`,
      size: blob.size,
      blob,
      url: blobUrl,
      type: blob.type || 'application/octet-stream'
    }
  } catch (error) {
    console.error(`下载资源失败 ${url}:`, error)
    throw error
  }
}

/**
 * 批量下载资源
 */
export async function downloadResources(
  resources: ResourceInfo[],
  baseUrl?: string,
  onProgress?: (current: number, total: number, url: string) => void
): Promise<DownloadedResource[]> {
  const downloaded: DownloadedResource[] = []
  const total = resources.length
  
  for (let i = 0; i < resources.length; i++) {
    const resource = resources[i]
    if (onProgress) {
      onProgress(i + 1, total, resource.url)
    }
    
    try {
      // 传递资源类型给下载函数
      const downloadedResource = await downloadResource(resource.url, baseUrl, resource.type)
      downloaded.push(downloadedResource)
      console.log(`✅ 成功下载资源: ${resource.url} -> ${downloadedResource.name}`)
    } catch (error) {
      console.error(`❌ 下载资源失败 ${resource.url}:`, error)
      // 继续下载其他资源，但不添加到结果中
    }
  }
  
  console.log(`📦 总共下载了 ${downloaded.length}/${total} 个资源`)
  return downloaded
}

