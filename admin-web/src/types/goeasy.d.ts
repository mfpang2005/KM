// NOTE: goeasy 的 package.json exports 未正确暴露类型路径，
// 在 moduleResolution: "bundler" 下需要手动声明绕过此问题。
// 直接复用包内已有的 GoEasy.d.ts 类型定义。
declare module 'goeasy' {
    import GoEasy from 'goeasy/GoEasy';
    export default GoEasy;
}

