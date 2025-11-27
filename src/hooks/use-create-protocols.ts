import { createGlobalState } from '@vueuse/core'
import { useBuildTx,type CreatePinOptions ,type MetaidData } from './use-build-tx'
import { hexToBase64, hexToUint8Array } from '@/utils/util'
import {ProtocolCollection,NodeName,NodeCollection } from "@/data/constants";


export const useCreateProtocols = createGlobalState(()=>{
    const AddressHost=import.meta.env.VITE_ADDRESS_HOST
    const {registerProtocolRule,createPin,buildTransaction}=useBuildTx()


async function createBuzz(metaidData:Omit<MetaidData, 'revealAddr'>,options:CreatePinOptions = {}){

        registerProtocolRule(ProtocolCollection[NodeName.SimpleBuzz].protocol, {
        pattern: new RegExp(`${AddressHost ? AddressHost.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') : ''}:/protocols/simplebuzz`, 'i'),
        handler: async (metaidData) => {
        console.log('📱 [simplebuzz] Processing simplebuzz protocol')
        return await createPin({
        operation: metaidData.operation || 'create',
        body: metaidData.body,
        path: metaidData.path || `${AddressHost}:/protocols/simplebuzz`,
        contentType: metaidData.contentType || 'text/plain;utf-8',
        encryption: metaidData.encryption || '0',
        version: metaidData.version || '1.0.0',
        encoding: metaidData.encoding || 'utf-8'
        }, metaidData.options || {})
        },
        description: '显示消息协议处理',
        defaultOptions: {
        chain:options.chain || 'mvc',
        network:options.network || 'mainnet',
        signMessage: 'Create Buzz'
        }
        })

        const result = await buildTransaction({
        path: metaidData.path,
        body: JSON.stringify(metaidData.body),
         contentType:metaidData.contentType
        })

        console.log('createBuzz result', result)
        return result
        }

async function createFile(metaidData:Omit<MetaidData, 'revealAddr'>,options:CreatePinOptions = {}) {
     registerProtocolRule(NodeCollection[NodeName.File].path, {
        pattern: new RegExp(`${AddressHost ? AddressHost.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') : ''}:/file`, 'i'),
        handler: async (metaidData) => {
        console.log('📱 [File] Processing file')
        return await createPin({
        operation: metaidData.operation || 'create',
        body:options.chain == 'btc' ? hexToBase64(options.attachments[0]!.data) : hexToUint8Array(options.attachments[0]!.data),
        path: metaidData.path || `${AddressHost}:/file`,
        contentType: metaidData.contentType || `${options.mime};binary`,
        encryption: metaidData.encryption || '0',
        version: metaidData.version || '1.0.0',
        encoding: metaidData.encoding || (options.chain == 'btc' ? 'base64' : 'binary' )
        }, metaidData.options || {})
        },
        description: '文件上传协议处理',
        defaultOptions: {
        chain:options.chain || 'mvc',
        network:options.network || 'mainnet',
        signMessage: 'Create File'
        }
        })

        const result = await buildTransaction({
        path: metaidData.path,
        body: options.chain == 'btc' ? hexToBase64(options.attachments[0]!.data) : hexToUint8Array(options.attachments[0]!.data),
        contentType:`${options.mime};binary`
        })

        console.log('createFile result', result)
        return result
}

async function createPayLike(metaidData:Omit<MetaidData, 'revealAddr'>,options:CreatePinOptions = {}) {
    registerProtocolRule(ProtocolCollection[NodeName.PayLike].protocol, {
        pattern: new RegExp(`${AddressHost ? AddressHost.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') : ''}:/protocols/paylike`, 'i'),
        handler: async (metaidData) => {
        console.log('👍 [PayLike] Processing paylike protocol')
        return await createPin({
        operation: metaidData.operation || 'create',
        body: metaidData.body,
        path: metaidData.path || `${AddressHost}:/protocols/paylike`,
        contentType: metaidData.contentType || 'text/plain;utf-8',
        encryption: metaidData.encryption || '0',
        version: metaidData.version || '1.0.0',
        encoding: metaidData.encoding || 'utf-8'
        }, metaidData.options || {})
        },
        description: '点赞协议处理',
        defaultOptions: {
        chain:options.chain || 'mvc',
        network:options.network || 'mainnet',
        signMessage: 'Pay Like'
        }
        })

        const result = await buildTransaction({
        path: metaidData.path,
        body: JSON.stringify(metaidData.body),
        contentType:metaidData.contentType
        })

        console.log('createPayLike result', result)
        return result
}

async function createSimpletree(metaidData:Omit<MetaidData, 'revealAddr'>,options:CreatePinOptions = {}){

        registerProtocolRule(ProtocolCollection[NodeName.SimpleTree].protocol, {
        pattern: new RegExp(`${AddressHost ? AddressHost.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') : ''}:/protocols/simpletree`, 'i'),
        handler: async (metaidData) => {
        console.log('📱 [SimpleTree] Processing simpletree protocol')
        return await createPin({
        operation: metaidData.operation || 'create',
        body: metaidData.body,
        path: metaidData.path || `${AddressHost}:/protocols/simpletree`,
        contentType: metaidData.contentType || 'application/json',
        encryption: metaidData.encryption || '0',
        version: metaidData.version || '1.0.0',
        encoding: metaidData.encoding || 'utf-8'
        }, metaidData.options || {})
        },
        description: '',
        defaultOptions: {
        chain:options.chain || 'mvc',
        network:options.network || 'mainnet',
        signMessage: 'Create Tree'
        }
        })

        const result = await buildTransaction({
        path: metaidData.path,
        body: JSON.stringify(metaidData.body),
        contentType:metaidData.contentType
        })

        console.log('createTree result', result)
        return result
        }




        return {
            createBuzz,
            createFile,
            createPayLike,
            createSimpletree
        }

        })


