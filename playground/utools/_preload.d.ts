// 该类型定义文件由 @ver5/vite-plugin-utools 自动生成
// 请不要更改这个文件！
import type defaultExport from './preload'
import type * as namedExports from './preload'

export type PreloadDefaultType = typeof defaultExport
export type PreloadNamedExportsType = typeof namedExports

export interface ExportsTypesForMock {
	window: PreloadDefaultType,
	preload: Omit<PreloadNamedExportsType, 'default'>,
}

declare global {
	interface Window extends PreloadDefaultType {
		preload: PreloadNamedExportsType;
	}
}
