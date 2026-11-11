'use strict';

/* 预加载脚本：把"打开书 / 保存笔记"需要的几个函数交给页面。
   页面本身仍然拿不到 node 能力（nodeIntegration 关着、contextIsolation 开着）。
   打包版必须走这条原生通道，原因是 Electron 里 File System Access 的句柄权限
   不跨会话保留：历史记录重开书、笔记写入都会退化成"每次都弹选择框"。 */

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('nativeBook', {
  // 弹系统"打开文件"对话框，返回 {ok,name,path,data}
  open: function () { return ipcRenderer.invoke('book:open'); },
  // 按真实路径直接读取，不弹任何框；文件不在了返回 {ok:false,missing:true}
  openPath: function (p) { return ipcRenderer.invoke('book:openPath', p); }
});

contextBridge.exposeInMainWorld('nativeNote', {
  save: function (payload) { return ipcRenderer.invoke('note:save', payload); },
  pickDir: function () { return ipcRenderer.invoke('note:pickDir'); },
  getDir: function () { return ipcRenderer.invoke('note:getDir'); },
  clearDir: function () { return ipcRenderer.invoke('note:clearDir'); }
});
