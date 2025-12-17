// 请不要直接修改此文件，因为它会在每次构建时被覆盖。
// 该类型定义文件由 @ver5/vite-plugin-utools 自动生成
import type { ExportsTypesForMock } from './_preload.d';

export const autoMock: ExportsTypesForMock = {
	// 自动生成的直接挂载在 window 下的实现
	window:{
		extractAll: undefined as any,
		toast() {
			return undefined as any;
		},
		case() {
			return undefined as any;
		}},
	// 自动生成的直接挂载在 window 下的实现
	preload: {
		SCRIPTS: ['122', 34],
		hello() {
			return undefined as any;
		},
		read() {
			return undefined as any;
		},
		read1() {
			return undefined as any;
		}
	}
}
