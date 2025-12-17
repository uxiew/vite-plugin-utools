// 请根据需要自定义 mock 实现。
import { autoMock } from './_mock.auto';

// 你可以直接修改 autoMock 对象，或者覆盖它
// 例如:
// autoMock.preload.someFunction = () => { ... }

autoMock.window.toast = () => {
    console.log('toastxxxx');
}
export default autoMock;
