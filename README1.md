# vue3 渲染器详解（二）

[vue3 渲染器详解（一）](https://github.com/HJianfeng/vue-source)  
[vue3 渲染器详解（二）](https://github.com/HJianfeng/vue-source/blob/master/README1.md)  
[vue3 渲染器详解（三）](https://github.com/HJianfeng/vue-source/blob/master/README2.md)  

这节我们讲的是`patch`
## 五、渲染器之patch
`patch`的职责就是对比新旧两个`VNode`，并以合适的方式更新DOM，在开发过程中patch是经常被调用的，所以`patch`的合理性，直接影响到我们应用的性能。

#### 1.替换VNode
我们重新回顾一下前面`render`方法是如何调用`patch`
``` javascript
function render(vnode, container) {
  const prevVNode = container.vnode || null;
  if (prevVNode === null) {
    // 没有旧的 VNode，只有新的 VNode。使用 `mount` 函数挂载全新的 VNode
    if (vnode) {
      mount(vnode, container);
      // 将新的 VNode 添加到 container.vnode 属性下，这样下一次渲染时旧的 VNode 就存在了
      container.vnode = vnode;
    }
  } else {
    if (vnode) {
      patch(prevVNode, vnode, container);
      container.vnode = vnode;
    } else {
      container.removeChild(prevVNode.el);
      container.vnode = null;
    }
  }
}
```
只有当同时存在新旧`VNode`的时候我们才会去调用`patch`。  
我们分析一下不同情况我们需要怎么去比对：
```javascript
function patch(prevVNode, nextVNode, container) {
  // 分别拿到新旧 VNode 的类型，即 flags
  const nextFlags = nextVNode.flags
  const prevFlags = prevVNode.flags

  // 检查新旧 VNode 的类型是否相同，如果类型不同，则直接调用 replaceVNode 函数替换 VNode
  // 如果新旧 VNode 的类型相同，则根据不同的类型调用不同的比对函数
  if (prevFlags !== nextFlags) {
    replaceVNode(prevVNode, nextVNode, container)
  } else if (nextFlags & VNodeFlags.ELEMENT) {
    patchElement(prevVNode, nextVNode, container)
  } else if (nextFlags & VNodeFlags.COMPONENT) {
    patchComponent(prevVNode, nextVNode, container)
  } else if (nextFlags & VNodeFlags.TEXT) {
    patchText(prevVNode, nextVNode)
  } else if (nextFlags & VNodeFlags.FRAGMENT) {
    patchFragment(prevVNode, nextVNode, container)
  } else if (nextFlags & VNodeFlags.PORTAL) {
    patchPortal(prevVNode, nextVNode)
  }
}
```
如上，我们用不同的方法来处理各种情况。我们先来设计一下`replaceVNode`
```javascript
function replaceVNode (prevVNode, nextVNode, container) {
    // 移除旧的VNode
    container.removeChild(prevVNode.el);
    // 在把新的挂载到 container
    mount(nextVNode, container)
}
```
#### 2.patchElement
当新旧VNode都是标签元素的时候，我们调用`patchElement`来更新。
```javascript
function patchElement (prevVNode, nextVNode, container) {
    // 如果新旧标签不同，我们也只能调用 replaceVNode 来进行替换
    if (prevVNode.tag !== nextVNode.tag) {
        replaceVNode(prevVNode, nextVNode, container);
        return;
    }
}
```
如果标签相同，那改变的就只能是`VNodeData`或`children`，
```javascript
function patchElement (prevVNode, nextVNode, container) {
  // 如果新旧标签不同，我们也只能调用 replaceVNode 来进行替换
  if (prevVNode.tag !== nextVNode.tag) {
    replaceVNode(prevVNode, nextVNode, container);
    return;
  }
  
  // 拿到 el 元素，注意这时要让 nextVNode.el 也引用该元素
  const el = (nextVNode.el = prevVNode.el)
  const prevData = prevVNode.data
  const nextData = nextVNode.data

  if (nextData) {
    // 遍历新的 VNodeData，将旧值和新值都传递给 patchData 函数
    for (let key in nextData) {
      const prevValue = prevData[key]
      const nextValue = nextData[key]
      patchData(el, key, prevValue, nextValue)
    }
  }
  if (prevData) {
    // 遍历旧的 VNodeData，将已经不存在于新的 VNodeData 中的数据移除
    for (let key in prevData) {
      const prevValue = prevData[key]
      if (prevValue && !nextData.hasOwnProperty(key)) {
        // 第四个参数为 null，代表移除数据
        patchData(el, key, prevValue, null)
      }
    }
  }
}
```
如果新VNode存在data，则遍历`VNodeData`其实这里的挂载`VNodeData`和之前我们在`mountElement`方法定义的挂载`VNodeData`很相似，所以我们可以封装到一个方法`patchData`里。
```javascript
export function patchData(el, key, prevValue, nextValue) {
  const domPropsRE = /\W|^(?:value|checked|selected|muted)$/
  switch (key) {
    case 'style':
      // 将新的样式数据应用到元素
      for (let k in nextValue) {
        el.style[k] = nextValue[k]
      }
      // 移除已经不存在的样式
      for (let k in prevValue) {
        if (!nextValue.hasOwnProperty(k)) {
          el.style[k] = ''
        }
      }
      break
    case 'class':
      el.className = nextValue
      break
    default:
      if (key[0] === 'o' && key[1] === 'n') {
        // 移除旧事件
        if (prevValue) {
          el.removeEventListener(key.slice(2), prevValue)
        }
        // 添加新事件
        if (nextValue) {
          el.addEventListener(key.slice(2), nextValue)
        }
      } else if (domPropsRE.test(key)) {
        // 当作 DOM Prop 处理
        el[key] = nextValue
      } else {
        // 当作 Attr 处理
        el.setAttribute(key, nextValue)
      }
      break
  }
}
```
接下来就是更新子节点，我们在`patchElement`最后面调用`patchChildren`递归的更新子节点。
```javascript
// 调用 patchChildren 函数递归地更新子节点
  patchChildren(
    prevVNode.childFlags, // 旧的 VNode 子节点的类型
    nextVNode.childFlags, // 新的 VNode 子节点的类型
    prevVNode.children,   // 旧的 VNode 子节点
    nextVNode.children,   // 新的 VNode 子节点
    el                    // 当前标签元素，即这些子节点的父节点
  )
```
```javascript

```