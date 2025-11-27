import JSZip from 'jszip'
import { 
  extractResourcesFromHTML, 
  downloadResources,
  getFileNameFromUrl
} from './html-analyzer'

/**
 * 文件树节点接口
 */
export interface FileTreeNode {
  name: string
  path: string
  type: 'file' | 'directory'
  size?: number
  children?: FileTreeNode[]
  blobUrl?: string // 文件的 blob URL，用于在浏览器中打开
  blob?: Blob // 文件的 Blob 对象
}

/**
 * 解压进度回调
 */
export interface ExtractProgress {
  loaded: number
  total: number
  percent: number
  currentFile?: string
}

/**
 * 解压压缩包
 * @param file 压缩包文件
 * @param onProgress 进度回调
 * @returns 文件树结构和 ZIP 内容
 */
export async function extractZip(
  file: File,
  onProgress?: (progress: ExtractProgress) => void
): Promise<{ tree: FileTreeNode; zipContent: JSZip }> {
  try {
    const zip = new JSZip()
    
    // 加载 ZIP 文件
    const zipData = await file.arrayBuffer()
    const zipContent = await zip.loadAsync(zipData)
    
    // 触发初始进度
    if (onProgress) {
      onProgress({
        loaded: 1,
        total: 1,
        percent: 100,
        currentFile: '正在加载压缩包...'
      })
    }

    // 构建文件树
    const rootNode: FileTreeNode = {
      name: file.name.replace(/\.(zip|rar|7z)$/i, ''),
      path: '/',
      type: 'directory',
      children: []
    }

    const fileMap = new Map<string, FileTreeNode>()

    // 处理所有文件
    const files = Object.keys(zipContent.files)
    let processedFiles = 0

    for (const filePath of files) {
      const file = zipContent.files[filePath]
      
      // 跳过目录项（以 / 结尾的）
      if (file.dir) {
        continue
      }

      // 更新进度
      processedFiles++
      if (onProgress) {
        onProgress({
          loaded: processedFiles,
          total: files.length,
          percent: (processedFiles / files.length) * 100,
          currentFile: filePath
        })
      }

      // 解析路径
      const pathParts = filePath.split('/').filter(p => p)
      let currentPath = '/'
      let parentNode = rootNode

      // 创建目录结构
      for (let i = 0; i < pathParts.length - 1; i++) {
        const dirName = pathParts[i]
        currentPath += (currentPath === '/' ? '' : '/') + dirName

        if (!fileMap.has(currentPath)) {
          const dirNode: FileTreeNode = {
            name: dirName,
            path: currentPath,
            type: 'directory',
            children: []
          }
          fileMap.set(currentPath, dirNode)
          parentNode.children!.push(dirNode)
        }

        parentNode = fileMap.get(currentPath)!
      }

      // 添加文件节点
      const fileName = pathParts[pathParts.length - 1]
      const filePathFull = currentPath + (currentPath === '/' ? '' : '/') + fileName
      
      // 获取文件大小（从 JSZip 的元数据中获取，不实际读取文件内容）
      // JSZip 的 _data 属性包含未压缩大小信息
      const fileSize = (file as any)._data?.uncompressedSize || 0
      
      const fileNode: FileTreeNode = {
        name: fileName,
        path: filePathFull,
        type: 'file',
        size: fileSize,
        // 存储 zipFile 引用，后续用于创建 blob URL
        _zipFile: file
      } as any

      parentNode.children!.push(fileNode)
    }

    return { tree: rootNode, zipContent }
  } catch (error) {
    console.error('解压失败:', error)
    throw new Error(`解压失败: ${error instanceof Error ? error.message : '未知错误'}`)
  }
}

/**
 * 为所有文件创建 blob URL
 */
async function createBlobUrlsForFiles(
  node: FileTreeNode,
  zipContent: JSZip
): Promise<void> {
  if (node.type === 'file') {
    try {
      const zipPath = node.path.replace(/^\//, '')
      const zipFile = zipContent.file(zipPath) || (node as any)._zipFile
      if (zipFile && !node.blobUrl) {
        const blob = await zipFile.async('blob')
        node.blobUrl = URL.createObjectURL(blob)
        node.blob = blob
      }
    } catch (error) {
      console.warn(`为文件 ${node.name} 创建 blob URL 失败:`, error)
    }
  }
  
  if (node.children) {
    for (const child of node.children) {
      await createBlobUrlsForFiles(child, zipContent)
    }
  }
}

/**
 * 处理 HTML 文件并下载外部资源
 */
export async function processHTMLFiles(
  zipContent: JSZip,
  rootNode: FileTreeNode,
  onProgress?: (progress: ExtractProgress) => void
): Promise<FileTreeNode> {
  // 首先为所有文件创建 blob URL
  await createBlobUrlsForFiles(rootNode, zipContent)
  
  // 查找所有 HTML 文件
  const htmlFiles: Array<{ path: string; node: FileTreeNode; zipPath: string; isRoot: boolean }> = []
  
  function findHTMLFiles(node: FileTreeNode) {
    if (node.type === 'file' && node.name.toLowerCase().endsWith('.html')) {
      // 构建 ZIP 中的文件路径（移除开头的 /）
      const zipPath = node.path.replace(/^\//, '')
      // 判断是否是根目录下的 HTML 文件（路径层级为 1，即 /filename.html）
      const pathDepth = node.path.split('/').filter(p => p).length
      htmlFiles.push({ path: node.path, node, zipPath, isRoot: pathDepth === 1 })
    }
    if (node.children) {
      node.children.forEach(child => findHTMLFiles(child))
    }
  }
  
  findHTMLFiles(rootNode)
  
  if (htmlFiles.length === 0) {
    return rootNode
  }
  
  // 存储资源 URL 到文件名的映射（用于替换 HTML 中的路径）
  const resourceUrlMap = new Map<string, string>()
  
  // 处理每个 HTML 文件
  for (let i = 0; i < htmlFiles.length; i++) {
    const { path, node, zipPath } = htmlFiles[i]
    
    if (onProgress) {
      onProgress({
        loaded: i + 1,
        total: htmlFiles.length,
        percent: ((i + 1) / htmlFiles.length) * 100,
        currentFile: `正在分析 ${node.name}...`
      })
    }
    
    try {
      // 读取 HTML 文件内容
      const htmlFile = zipContent.file(zipPath)
      if (!htmlFile) {
        // 尝试不同的路径格式
        const altPath = zipPath.replace(/^\//, '')
        const altFile = zipContent.file(altPath)
        if (!altFile) {
          console.warn(`找不到 HTML 文件: ${zipPath}`)
          continue
        }
        
        const htmlContent = await altFile.async('string')
        const downloadedResources = await processHTMLContent(
          htmlContent, 
          node, 
          path, 
          rootNode, 
          onProgress, 
          i, 
          htmlFiles.length, 
          altFile
        )
        
        // 记录资源映射 - 直接使用下载的资源信息建立映射
        downloadedResources.forEach(resource => {
          // 从原始 HTML 中找到对应的 URL
          const resources = extractResourcesFromHTML(htmlContent)
          // 通过比较 URL 来匹配（更可靠的方式）
          const matchedResource = resources.find(r => {
            // 尝试多种匹配方式
            const originalFileName = getFileNameFromUrl(r.url, r.type)
            // 直接比较文件名
            if (originalFileName === resource.name) {
              return true
            }
            // 或者比较 URL 的路径部分
            try {
              const originalUrl = new URL(r.url, window.location.href)
              const resourceUrl = new URL(resource.path.replace('/src/', ''), window.location.href)
              return originalUrl.pathname.includes(resourceUrl.pathname) || 
                     resourceUrl.pathname.includes(originalUrl.pathname)
            } catch {
              // 如果 URL 解析失败，尝试字符串匹配
              return r.url.includes(resource.name) || resource.name.includes(r.url.split('/').pop() || '')
            }
          })
          if (matchedResource) {
            resourceUrlMap.set(matchedResource.url, resource.name)
            console.log(`📝 建立映射: ${matchedResource.url} -> ${resource.name}`)
          } else {
            // 如果找不到匹配，尝试直接通过 URL 匹配
            const directMatch = resources.find(r => {
              try {
                const url1 = new URL(r.url, window.location.href)
                const url2 = new URL(resource.path.replace('/src/', ''), window.location.href)
                return url1.href === url2.href || url1.pathname === url2.pathname
              } catch {
                return false
              }
            })
            if (directMatch) {
              resourceUrlMap.set(directMatch.url, resource.name)
              console.log(`📝 建立直接映射: ${directMatch.url} -> ${resource.name}`)
            } else {
              console.warn(`⚠️ 无法为资源建立映射: ${resource.name} (来自 ${resources.map(r => r.url).join(', ')})`)
            }
          }
        })
        continue
      }
      
      const htmlContent = await htmlFile.async('string')
      const downloadedResources = await processHTMLContent(
        htmlContent, 
        node, 
        path, 
        rootNode, 
        onProgress, 
        i, 
        htmlFiles.length, 
        htmlFile
      )
      
      // 记录资源映射 - 直接使用下载的资源信息建立映射
      downloadedResources.forEach(resource => {
        // 从原始 HTML 中找到对应的 URL
        const resources = extractResourcesFromHTML(htmlContent)
        // 通过比较 URL 来匹配（更可靠的方式）
        const matchedResource = resources.find(r => {
          // 尝试多种匹配方式
          const originalFileName = getFileNameFromUrl(r.url, r.type)
          // 直接比较文件名
          if (originalFileName === resource.name) {
            return true
          }
          // 或者比较 URL 的路径部分
          try {
            const originalUrl = new URL(r.url, window.location.href)
            const resourceUrl = new URL(resource.path.replace('/src/', ''), window.location.href)
            return originalUrl.pathname.includes(resourceUrl.pathname) || 
                   resourceUrl.pathname.includes(originalUrl.pathname)
          } catch {
            // 如果 URL 解析失败，尝试字符串匹配
            return r.url.includes(resource.name) || resource.name.includes(r.url.split('/').pop() || '')
          }
        })
        if (matchedResource) {
          resourceUrlMap.set(matchedResource.url, resource.name)
          console.log(`📝 建立映射: ${matchedResource.url} -> ${resource.name}`)
        } else {
          // 如果找不到匹配，尝试直接通过 URL 匹配
          const directMatch = resources.find(r => {
            try {
              const url1 = new URL(r.url, window.location.href)
              const url2 = new URL(resource.path.replace('/src/', ''), window.location.href)
              return url1.href === url2.href || url1.pathname === url2.pathname
            } catch {
              return false
            }
          })
          if (directMatch) {
            resourceUrlMap.set(directMatch.url, resource.name)
            console.log(`📝 建立直接映射: ${directMatch.url} -> ${resource.name}`)
          } else {
            console.warn(`⚠️ 无法为资源建立映射: ${resource.name} (来自 ${resources.map(r => r.url).join(', ')})`)
          }
        }
      })
      
    } catch (error) {
      console.warn(`处理 HTML 文件 ${node.name} 失败:`, error)
      // 继续处理其他文件
    }
  }
  
  // 修改根目录下的 HTML 文件
  const rootHTMLFiles = htmlFiles.filter(f => f.isRoot)
  for (const { node, zipPath } of rootHTMLFiles) {
    try {
      const htmlFile = zipContent.file(zipPath) || zipContent.file(zipPath.replace(/^\//, ''))
      if (!htmlFile) continue
      
      // 重新读取原始 HTML 内容（确保是最新的）
      let htmlContent = await htmlFile.async('string')
      
      // 修改 HTML 内容，替换 script 和 link 的路径
      htmlContent = replaceResourcePathsInHTML(htmlContent, resourceUrlMap)
      
      // 创建修改后的 blob，使用 UTF-8 编码
      const modifiedBlob = new Blob([htmlContent], { 
        type: 'text/html;charset=utf-8' 
      })
      
      // 撤销旧的 blob URL（如果存在）
      if (node.blobUrl) {
        try {
          URL.revokeObjectURL(node.blobUrl)
        } catch (e) {
          // 忽略撤销错误
        }
      }
      
      // 创建新的 blob URL
      node.blobUrl = URL.createObjectURL(modifiedBlob)
      node.blob = modifiedBlob
      
      // 确保节点被标记为已更新
      console.log(`✅ HTML 文件 ${node.name} 已修改，新的 blobUrl:`, node.blobUrl)
      
      if (onProgress) {
        onProgress({
          loaded: htmlFiles.length,
          total: htmlFiles.length,
          percent: 100,
          currentFile: `已修改 ${node.name}`
        })
      }
    } catch (error) {
      console.error(`修改 HTML 文件 ${node.name} 失败:`, error)
      // 如果修改失败，至少确保原始的 blobUrl 仍然可用
      if (!node.blobUrl) {
        try {
          const htmlFile = zipContent.file(zipPath) || zipContent.file(zipPath.replace(/^\//, ''))
          if (htmlFile) {
            const htmlBlob = await htmlFile.async('blob')
            node.blobUrl = URL.createObjectURL(htmlBlob)
            node.blob = htmlBlob
          }
        } catch (e) {
          console.error(`无法为 ${node.name} 创建备用 blobUrl:`, e)
        }
      }
    }
  }
  
  return rootNode
}

/**
 * 替换 HTML 中的资源路径
 */
function replaceResourcePathsInHTML(
  htmlContent: string,
  resourceUrlMap: Map<string, string>
): string {
  let modifiedContent = htmlContent
  
  // 调试：输出映射表
  console.log('🔍 资源映射表:', Array.from(resourceUrlMap.entries()))
  
  // 替换 script 标签的 src（只处理有 src 属性的 script 标签）
  modifiedContent = modifiedContent.replace(
    /<script([^>]*)\ssrc\s*=\s*["']([^"']+)["']([^>]*)>/gi,
    (match, before, url, after) => {
      // 确保这个 script 标签确实有 src 属性
      if (!match.includes('src=')) {
        return match
      }
      
      // 查找对应的本地文件名（精确匹配）
      let fileName = resourceUrlMap.get(url)
      
      // 如果精确匹配失败，尝试规范化 URL 后再匹配
      if (!fileName) {
        try {
          // 规范化 URL（移除末尾的斜杠、统一协议等）
          const normalizedUrl = new URL(url, window.location.href).href
          fileName = resourceUrlMap.get(normalizedUrl)
          
          // 如果还是找不到，尝试匹配所有可能的变体
          if (!fileName) {
            for (const [mapUrl, mapFileName] of resourceUrlMap.entries()) {
              try {
                const url1 = new URL(url, window.location.href)
                const url2 = new URL(mapUrl, window.location.href)
                // 比较路径名
                if (url1.pathname === url2.pathname || 
                    url1.href === url2.href ||
                    url1.pathname.endsWith(url2.pathname) ||
                    url2.pathname.endsWith(url1.pathname)) {
                  fileName = mapFileName
                  console.log(`🔗 找到匹配: ${url} -> ${mapUrl} -> ${fileName}`)
                  break
                }
              } catch {
                // 如果 URL 解析失败，尝试字符串匹配
                if (url === mapUrl || url.includes(mapUrl) || mapUrl.includes(url)) {
                  fileName = mapFileName
                  break
                }
              }
            }
          }
        } catch (e) {
          // URL 解析失败，保持原样
        }
      }
      
      if (fileName) {
        console.log(`✅ 替换路径: ${url} -> src/${fileName}`)
        return `<script${before} src="src/${fileName}"${after}>`
      } else {
        console.warn(`⚠️ 未找到映射: ${url}`)
      }
      // 如果没有找到映射，说明这个资源没有被下载，保持原样
      return match
    }
  )
  
  // 替换 link 标签的 href（只处理有 href 属性的 link 标签）
  modifiedContent = modifiedContent.replace(
    /<link([^>]*)\shref\s*=\s*["']([^"']+)["']([^>]*)>/gi,
    (match, before, url, after) => {
      // 确保这个 link 标签确实有 href 属性
      if (!match.includes('href=')) {
        return match
      }
      
      // 查找对应的本地文件名（精确匹配）
      let fileName = resourceUrlMap.get(url)
      
      // 如果精确匹配失败，尝试规范化 URL 后再匹配
      if (!fileName) {
        try {
          const normalizedUrl = new URL(url, window.location.href).href
          fileName = resourceUrlMap.get(normalizedUrl)
          
          if (!fileName) {
            for (const [mapUrl, mapFileName] of resourceUrlMap.entries()) {
              try {
                const url1 = new URL(url, window.location.href)
                const url2 = new URL(mapUrl, window.location.href)
                if (url1.pathname === url2.pathname || 
                    url1.href === url2.href ||
                    url1.pathname.endsWith(url2.pathname) ||
                    url2.pathname.endsWith(url1.pathname)) {
                  fileName = mapFileName
                  break
                }
              } catch {
                if (url === mapUrl || url.includes(mapUrl) || mapUrl.includes(url)) {
                  fileName = mapFileName
                  break
                }
              }
            }
          }
        } catch (e) {
          // URL 解析失败，保持原样
        }
      }
      
      if (fileName) {
        console.log(`✅ 替换路径: ${url} -> src/${fileName}`)
        return `<link${before} href="src/${fileName}"${after}>`
      } else {
        console.warn(`⚠️ 未找到映射: ${url}`)
      }
      return match
    }
  )
  
  return modifiedContent
}

/**
 * 处理 HTML 内容
 */
async function processHTMLContent(
  htmlContent: string,
  node: FileTreeNode,
  path: string,
  rootNode: FileTreeNode,
  onProgress: ((progress: ExtractProgress) => void) | undefined,
  currentIndex: number,
  totalFiles: number,
  htmlFile: JSZip.JSZipObject
): Promise<Array<{ name: string; path: string; size: number; blob: Blob; url: string; type: string }>> {
  // 提取资源
  const resources = extractResourcesFromHTML(htmlContent)
  
  if (resources.length === 0) {
    // 即使没有外部资源，也要为 HTML 文件创建 blob URL
    const htmlBlob = await htmlFile.async('blob')
    node.blobUrl = URL.createObjectURL(htmlBlob)
    node.blob = htmlBlob
    return []
  }
  
  // 构建 base URL（使用 HTML 文件的路径）
  const htmlPathParts = path.split('/').filter(p => p)
  htmlPathParts.pop() // 移除文件名
  const baseUrl = htmlPathParts.length > 0 
    ? `file:///${htmlPathParts.join('/')}/`
    : 'file:///'
  
  // 下载资源
      const downloadedResources = await downloadResources(
        resources,
        baseUrl,
        (_current, _total, url) => {
          if (onProgress) {
            onProgress({
              loaded: currentIndex + 1,
              total: totalFiles,
              percent: ((currentIndex + 1) / totalFiles) * 100,
              currentFile: `正在下载资源: ${url}`
            })
          }
        }
      )
  
  // 将下载的资源添加到文件树中
  // 在根目录下创建 src 文件夹
  let srcDir = rootNode.children?.find(child => 
    child.type === 'directory' && child.name === 'src'
  )
  
  if (!srcDir) {
    srcDir = {
      name: 'src',
      path: '/src',
      type: 'directory',
      children: []
    }
    if (!rootNode.children) {
      rootNode.children = []
    }
    rootNode.children.push(srcDir)
  }
  
  // 添加下载的资源到 src 目录
  downloadedResources.forEach(resource => {
    // 检查是否已存在同名文件
    const existingFile = srcDir!.children?.find(child => 
      child.type === 'file' && child.name === resource.name
    )
    
    if (!existingFile) {
      srcDir!.children!.push({
        name: resource.name,
        path: resource.path,
        type: 'file',
        size: resource.size,
        blobUrl: resource.url,
        blob: resource.blob
      })
    }
  })
  
  // 为 HTML 文件创建 blob URL（如果还没有创建）
  if (!node.blobUrl) {
    const htmlBlob = await htmlFile.async('blob')
    node.blobUrl = URL.createObjectURL(htmlBlob)
    node.blob = htmlBlob
  }
  
  return downloadedResources
}

/**
 * 保存文件到本地（使用 File System Access API）
 * 注意：这需要用户授权，且只在支持的浏览器中可用
 */
export async function saveFileToLocal(
  file: File,
  suggestedName?: string
): Promise<void> {
  try {
    // 检查浏览器是否支持 File System Access API
    if (!('showSaveFilePicker' in window)) {
      // 降级方案：使用下载
      const url = URL.createObjectURL(file)
      const a = document.createElement('a')
      a.href = url
      a.download = suggestedName || file.name
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
      return
    }

    // 使用 File System Access API
    const fileHandle = await (window as any).showSaveFilePicker({
      suggestedName: suggestedName || file.name,
      types: [{
        description: 'All Files',
        accept: { 'application/octet-stream': ['*'] }
      }]
    })

    const writable = await fileHandle.createWritable()
    await writable.write(file)
    await writable.close()
  } catch (error) {
    if ((error as any).name !== 'AbortError') {
      console.error('保存文件失败:', error)
      throw error
    }
  }
}

/**
 * 保存解压后的文件到本地 sources 目录
 * 注意：由于浏览器安全限制，这需要后端支持或使用 Electron
 * 这里提供一个模拟实现，实际应该调用后端 API
 */
export async function saveExtractedFilesToSources(
  zipFile: File,
  extractedTree: FileTreeNode
): Promise<void> {
  // 这里应该调用后端 API 来保存文件
  // 或者使用 Electron 的 fs API
  // 暂时只返回成功
  console.log('保存文件到 sources 目录:', {
    zipFile: zipFile.name,
    tree: extractedTree
  })
  
  // TODO: 实现后端 API 调用
  // const formData = new FormData()
  // formData.append('zip', zipFile)
  // await fetch('/api/extract-and-save', {
  //   method: 'POST',
  //   body: formData
  // })
}

