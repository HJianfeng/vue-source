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
`patchChildren`的作用就是对新旧 VNode 的子节点进行同层级的比较。我们先暂时不管具体代码，先把实现思路理清。
```javascript
function patchChildren(
  prevChildFlags,
  nextChildFlags,
  prevChildren,
  nextChildren,
  container
 ) {
    switch(prevChildFlags) {
        // 旧的 children 是单个子节点，会执行该 case 语句块
        case ChildrenFlags.SINGLE_VNODE:
        break;
        // 旧的 children 中没有节点，会执行该 case 语句块
        case ChildrenFlags.NO_CHILDREN:
        break;
        // 旧的 children 中有多个节点，会执行该 case 语句块
        default:
        break;
    }
}
```
这里判断旧的 children 各种类型的情况，我们还需要在各种情况里面分别判断新 children的类型。
```javascript
function patchChildren(
  prevChildFlags,
  nextChildFlags,
  prevChildren,
  nextChildren,
  container
 ) {
    switch(prevChildFlags) {
        // 旧的 children 是单个子节点，会执行该 case 语句块
        case ChildrenFlags.SINGLE_VNODE:
        // 判断新的 children
        switch (nextChildFlags) {
            case ChildrenFlags.SINGLE_VNODE:
              // 新的 children 是单个子节点，会执行该 case 语句块
              break;
            case ChildrenFlags.NO_CHILDREN:
                // 新的 children 中没有子节点时，会执行该 case 语句块
                break;
            default:
              // 新的 children 中有多个子节点时，会执行该 case 语句块
              break;
        }
        break;
        // 旧的 children 中没有节点，会执行该 case 语句块
        case ChildrenFlags.NO_CHILDREN:
        // 判断新的 children
        switch (nextChildFlags) {
            case ChildrenFlags.SINGLE_VNODE:
              // 新的 children 是单个子节点时，会执行该 case 语句块
              break
            case ChildrenFlags.NO_CHILDREN:
              // 新的 children 中没有子节点时，会执行该 case 语句块
              break
            default:
              // 新的 children 中有多个子节点时，会执行该 case 语句块
              break
        }
        break;
        // 旧的 children 中有多个节点，会执行该 case 语句块
        default:
        // 判断新的 children
        switch (nextChildFlags) {
            case ChildrenFlags.SINGLE_VNODE:
            // 新的 children 是单个子节点时，会执行该 case 语句块
             break
            case ChildrenFlags.NO_CHILDREN:
            // 新的 children 中没有子节点时，会执行该 case 语句块
            break
            default:
            // 新的 children 中有多个子节点时，会执行该 case 语句块
            break
        }
        break;
    }
}
```
代码有点长，但是逻辑很简单，我们使用了嵌套的 `switch...case ` 语句，外层的 `switch...case` 语句用来匹配旧的 children 的类型，里层的 `switch...case ` 用来匹配新的 children 的类型，所有总共有 `3 * 3 = 9`种情况。  
先来看当旧`children`为单个节点时：
```javascript
function patchChildren(
  prevChildFlags,
  nextChildFlags,
  prevChildren,
  nextChildren,
  container
) {
  switch (prevChildFlags) {
    case ChildrenFlags.SINGLE_VNODE:
      switch (nextChildFlags) {
        case ChildrenFlags.SINGLE_VNODE:
          // 此时 prevChildren 和 nextChildren 都是 VNode 对象，所以直接调用 patch
          patch(prevChildren, nextChildren, container)
          break
        case ChildrenFlags.NO_CHILDREN:
          // 新的 children 中没有子节点时，意思就是移除旧的子节点
          // 直接 removeChild 旧的节点
          container.removeChild(prevChildren.el)
          break
        default:
          // 新的 children 中有多个子节点时
          // 先移除旧的单个节点，然后循环挂载新的子节点
          container.removeChild(prevChildren.el)
          for(let i = 0; i < nextChildren.length; i++) {
            mount(nextChildren[i], container)
          }
          break
      }
      break

    // 省略...
  }
}
```
这样旧处理完第一种情况。当旧`children`为空时很简单，分别挂载就行了：
```javascript
function patchChildren(
  prevChildFlags,
  nextChildFlags,
  prevChildren,
  nextChildren,
  container
 ) {
    switch(prevChildFlags) {
    
        // 省略...
        
        // 旧的 children 中没有节点，会执行该 case 语句块
        case ChildrenFlags.NO_CHILDREN:
            // 判断新的 children
            switch (nextChildFlags) {
                case ChildrenFlags.SINGLE_VNODE:
                  // 新的 children 是单个子节点时，直接挂载
                  mount(nextChildren, container)
                  break
                case ChildrenFlags.NO_CHILDREN:
                  // 新旧 VNode 都没有 children ，我们什么都不做
                  break
                default:
                  // 新的 children 中有多个子节点时，循环挂载
                  for(let i = 0; i < nextChildren.length; i++) {
                    mount(nextChildren[i], container)
                  }
                  break
            }
        break;
        
        // 省略...
    }
}
```
第三种情况，旧的 `children` 有多个节点时：
```javascript
function patchChildren(
  prevChildFlags,
  nextChildFlags,
  prevChildren,
  nextChildren,
  container
 ) {
    switch(prevChildFlags) {
       
        // 省略...
        
        // 旧的 children 中有多个节点，会执行该 case 语句块
        default:
        // 判断新的 children
        switch (nextChildFlags) {
            case ChildrenFlags.SINGLE_VNODE:
            // 旧的 children有多个，新的只有一个
            // 移除旧的子节点，挂载新的节点
            for (let i = 0; i < prevChildren.length; i++) {
                container.removeChild(prevChildren[i].el)
            }
            mount(nextChildren, container);
             break
            case ChildrenFlags.NO_CHILDREN:
                // 新的 children 中没有子节点时，移除旧的子节点
                for (let i = 0; i < prevChildren.length; i++) {
                    container.removeChild(prevChildren[i].el)
                }
            break
            default:
            // 新的 children 中有多个子节点时
            // 我们暂时使用这种方式，等下一章我们再专门讲diff算法
            for (let i = 0; i < prevChildren.length; i++) {
                container.removeChild(prevChildren[i].el)
            }
            for (let i = 0; i < nextChildren.length; i++) {
                mount(nextChildren[i], container);
            }
            // 最好的处理方式 diff 算法
            break
        }
        break;
    }
}
```
这边前两种都很好处理，我们直接移除旧的子节点再挂载新的子节点就行了，第三种当新旧 `children` 都有多个的时候，虽然有一种思路我们可以直接移除所有旧的子节点再挂载新的子节点，但是这种处理方式很不好，这样做得话所有 DOM 的更新都毫无复用可言，而且性能也不好，所以我们这里的处理方式是使用 `diff 算法`。限于篇幅有限我们这里暂时使用暴力法来更新，等下一章再专门讲`diff算法`。  
#### 3.更新文本节点 patchText
我们在实际使用时标签元素的更新是最多的，所以我们花了大篇幅讲标签元素的更新。文本节点的更新就比较简单。
```javascript
function patchText(prevVNode, nextVNode) {
    // 拿到文本元素 el，同时让 nextVNode.el 指向该文本元素
    const el = (nextVNode.el = prevVNode.el)
    // 只有当新旧文本内容不一致时才有必要更新
    if (nextVNode.children !== prevVNode.children) {
        el.nodeValue = nextVNode.children
    }
}
```
#### 4.更新 Fragment
如果两个 `VNode` 的类型都是片段，我们只需要处理 `children` 的对比，还记得 `patchChildren` 吗？没错，我们直接调用就可以了，但是别忘记更新`nextVNode.el`
```javascript
function patchFragment(prevVNode, nextVNode, container) {
  // 直接调用 patchChildren 函数更新 新旧片段的子节点即可
  patchChildren(
    prevVNode.childFlags, // 旧片段的子节点类型
    nextVNode.childFlags, // 新片段的子节点类型
    prevVNode.children,   // 旧片段的子节点
    nextVNode.children,   // 新片段的子节点
    container
  )
  
  switch (nextVNode.childFlags) {
    case ChildrenFlags.SINGLE_VNODE:
      nextVNode.el = nextVNode.children.el
      break
    case ChildrenFlags.NO_CHILDREN:
      nextVNode.el = prevVNode.el
      break
    default:
      nextVNode.el = nextVNode.children[0].el
  }
}
```
#### 5.更新 Portal
`Portal`和`Fragment`一样，只需对比 `children`，但是需要考虑的是，挂载容器是否改变。
```javascript
function patchPortal(prevVNode, nextVNode, container) {
  // 直接调用 patchChildren 函数更新 新旧片段的子节点即可
  patchChildren(
    prevVNode.childFlags, // 旧片段的子节点类型
    nextVNode.childFlags, // 新片段的子节点类型
    prevVNode.children,   // 旧片段的子节点
    nextVNode.children,   // 新片段的子节点
    prevVNode.tag
  )
  nextVNode.el = prevVNode.el
  
  // 如果新旧容器相同，只需要对比 children 
  // 如果新旧容器不同，才需要搬运到新容器
  if (nextVNode.tag !== prevVNode.tag) {
    // 获取新的容器元素，即挂载目标
    const container =
      typeof nextVNode.tag === 'string'
        ? document.querySelector(nextVNode.tag)
        : nextVNode.tag

    switch (nextVNode.childFlags) {
      case ChildrenFlags.SINGLE_VNODE:
        // 如果新的 Portal 是单个子节点，就把该节点搬运到新容器中
        container.appendChild(nextVNode.children.el)
        break
      case ChildrenFlags.NO_CHILDREN:
        // 新的 Portal 没有子节点，不需要搬运
        break
      default:
        // 如果新的 Portal 是多个子节点，遍历逐个将它们搬运到新容器中
        for (let i = 0; i < nextVNode.children.length; i++) {
          container.appendChild(nextVNode.children[i].el)
        }
        break
    }
  }
}
```
#### 6.有状态组件的更新
我们在写有状态组件更新的代码前先思考一下，在什么情况下才会触发有状态组件的更新呢？实际上分为两种方式：主动更新 和 被动更新。  

主动更新：指的是组件自身的状态发生变化所导致的更新，例如组件的 data 数据发生了变化就必然需要重渲染。  
被动更新：因为父组件自身状态的变化很可能引起子组件外部状态的变化，此时就需要更新子组件，这种就是被动更新。  

##### 主动更新
我们知道组件的核心是`render`函数，它会产出 `VNode` ，渲染器会把产出的 `VNode` 渲染成真实的DOM，当组件状态的改变时我们需要做的就是重新执行渲染函数并产出新的 `VNode` 最后再通过新旧 `VNode` 之间的 `patch` 算法完成真实 DOM 的更新。这里的关键在于 "重新执行渲染函数并产出新的 `VNode` " 。我们回顾一下我们之前用于挂载有状态组件的代码。
```javascript
function mountStatefulComponent(vnode, container, isSVG) {
  // 创建组件实例
  const instance = new vnode.tag()
  // 渲染VNode
  instance.$vnode = instance.render()
  // 挂载
  mount(instance.$vnode, container, isSVG)
  // el 属性值 和 组件实例的 $el 属性都引用组件的根DOM元素
  instance.$el = vnode.el = instance.$vnode.el
}
```
实际上我们可以把里面创建组件实例这一步之外的代码封装成一个函数
```javascript
function mountStatefulComponent(vnode, container, isSVG) {
  // 创建组件实例
  const instance = new vnode.tag()

  instance._update = function() {
    // 1、渲染VNode
    instance.$vnode = instance.render()
    // 2、挂载
    mount(instance.$vnode, container, isSVG)
    // 4、el 属性值 和 组件实例的 $el 属性都引用组件的根DOM元素
    instance.$el = vnode.el = instance.$vnode.el
    // 5、调用 mounted 钩子，生命周期
    instance.mounted && instance.mounted()
  }

  instance._update()
}
```
这样我们的组件实例就多了一个 `_update` 的方法， `_update` 所做的工作就是渲染组件，这样当组件自身状态发生变化后，我们就可以再次调用 `_update` 函数来完成组件的更新。上面我们在 `_update` 最后一句调用了`mounted`，实际上这个就是我们在写组件时的生命周期 `mounted`，挂载结束后调用。  
但是我们在更新时不应该像初次挂载一样直接调用 `mount` 函数，而是应该调用 `patch` 去更新。但无论是初次挂载还是后续更新我们调用的都是 `_update` 函数，那怎么区分是不是第一次挂载呢？所以我们需要为组件实例设计一个 `boolean` 类型的状态标识，来区分是否是第一次挂载。
```javascript
function mountStatefulComponent(vnode, container, isSVG) {
  // 创建组件实例
  const instance = new vnode.tag()

  instance._update = function() {
    // 如果 instance._mounted 为真，说明组件已挂载，应该执行更新操作
    if (instance._mounted) {
        // 1、拿到旧的 VNode
        const prevVNode = instance.$vnode
        // 2、重渲染新的 VNode
        const nextVNode = (instance.$vnode = instance.render())
        // 3、patch 更新
        patch(prevVNode, nextVNode, prevVNode.el.parentNode)
        // 4、更新 vnode.el 和 $el
        instance.$el = vnode.el = instance.$vnode.el
    } else {
        // 1、渲染VNode
        instance.$vnode = instance.render()
        // 2、挂载
        mount(instance.$vnode, container, isSVG)
        // 3、组件已挂载的标识
        instance._mounted = true
        // 4、el 属性值 和 组件实例的 $el 属性都引用组件的根DOM元素
        instance.$el = vnode.el = instance.$vnode.el
        // 5、调用 mounted 钩子
        instance.mounted && instance.mounted()
    }
  }

  instance._update()
}
```
测试一下
```javascript
class MyComponent {
  // 自身状态 or 本地状态
  localState = 'one'

  // mounted 钩子
  mounted() {
    // 两秒钟之后修改本地状态的值，并重新调用 _update() 函数更新组件
    setTimeout(() => {
      this.localState = 'two'
      this._update()
    }, 2000)
  }

  render() {
    return h('div', null, this.localState)
  }
}
// 有状态组件 VNode
const compVNode = h(MyComponent)

render(compVNode, document.getElementById('app'))
```
在mounted上定义一个定时器，2s后修改localState，并且调用 `_update` 来更新，其实`_update`的调用应该是在响应系统里面，但是我们还没讲到，所以我们这里直接调用。

##### 被动更新
我们都知道如果父组件想要传数据到子组件的话，是需要通过 `props` 进行传递。当父组件的`data`更新时，子组件的 `props` 也会更新。我们先写一个父组件和子组件。
```javascript
// 子组件类
class ChildComponent {
  render() {
    // 子组件中访问外部状态：this.$props.text
    return h('div', null, this.$props.text)
  }
}
// 父组件类
class ParentComponent {
  localState = 'one'

  mounted() {
    // 两秒钟后将 localState 的值修改为 'two'
    setTimeout(() => {
      this.localState = 'two'
      this._update()
    }, 2000)
  }

  render() {
    return h(ChildComponent, {
      // 父组件向子组件传递的 props
      text: this.localState
    })
  }
}
// 有状态组件 VNode
const compVNode = h(ParentComponent)
render(compVNode, document.getElementById('app'))
```
父组件传了`text`到子组件，子组件通过 `props` 获取得到 `text`，2s后改变`text`的值，按照我们的期望，我们是希望子组件的文字会跟着变化。所以在 `_update` 函数内部的更新操作，等价于 prevCompVNode 和 nextCompVNode 之间的 patch，即：
```javascript
patch(prevCompVNode, nextCompVNode, prevCompVNode.el.parentNode)
```
因为都是组件所以在`patch`内部会调用`patchComponent`来更新
```javascript
function patchComponent (prevVNode, nextVNode, container) {
  // 检查组件是否是有状态组件
  if (nextVNode.flags & VNodeFlags.COMPONENT_STATEFUL_NORMAL) {
    // 1、获取组件实例
    const instance = (nextVNode.children = prevVNode.children)
    // 2、更新 props
    instance.$props = nextVNode.data
    // 3、更新组件
    instance._update()
  }
}
```
代码很简单，首先获取旧的组件实例，并传给新的 `nextVNode.children` ,然后把新VNode的数据更新到 `props ` ,最后调用 `_update`更新即可。  
我们之所以能够通过 VNode 的 children 属性来读取组件实例，例如上面代码中的 prevVNode.children，是因为每个类型为有状态组件的 VNode，在挂载期间我们都会让其 children 属性引用组件的实例，以便能够通过 VNode 访问组件实例对象。这一点我们早在“先设计 VNode 吧”一章中就有提及。所以我们需要修改 `mountStatefulComponent` 函数的代码，在创建组件实例后需要将实例对象赋值给 vnode.children 属性
```javascript
function mountStatefulComponent(vnode, container, isSVG) {
  // 创建组件实例，修改
  const instance = (vnode.children = new vnode.tag())
  // 初始化 props 新增
  instance.$props = vnode.data
  // 省略...
}
```
还有一种情况我们需要注意一下
```javascript
// 父组件类
class ParentComponent {
  isTrue = true

  mounted() {
    setTimeout(() => {
      this.isTrue = false
      this._update()
    }, 2000)
  }

  render() {
    // 如果 this.isTrue 的值为真，则渲染 ChildComponent1，否则渲染 ChildComponent2
    return this.isTrue ? h(ChildComponent1) : h(ChildComponent2)
  }
}
```
如果父组件的 `isTrue` 变化了，它会改变渲染的组件。从 `ChildComponent1` 变为 `ChildComponent2`，我们运行一下代码会发现，状态没有改变，我们需要改一下`patchComponent`的代码。
```javascript
function patchComponent(prevVNode, nextVNode, container) {
  // tag 属性的值是组件类，通过比较新旧组件类是否相等来判断是否是相同的组件
  if (nextVNode.tag !== prevVNode.tag) {
    replaceVNode(prevVNode, nextVNode, container)
  } else if (nextVNode.flags & VNodeFlags.COMPONENT_STATEFUL_NORMAL) {
    // 获取组件实例
    const instance = (nextVNode.children = prevVNode.children)
    // 更新 props
    instance.$props = nextVNode.data
    // 更新组件
    instance._update()
  }
}
```
如果不是相同的组件我们就直接调用 `replaceVNode` 替换。


#### 函数式组件的更新
接下来我们要讨论的是函数式组件的更新，其实无论是有状态组件还是函数式组件，它们的更新原理都是一样的，我们先举个例子：
```javascript
// 子组件 - 函数式组件
function MyFunctionalComp(props) {
  return h('div', null, props.text)
}
// 父组件的 render 函数中渲染了 MyFunctionalComp 子组件
class ParentComponent {
  localState = 'one'

  mounted() {
    setTimeout(() => {
      this.localState = 'two'
      this._update()
    }, 2000)
  }

  render() {
    return h(MyFunctionalComp, {
      text: this.localState
    })
  }
}

// 有状态组件 VNode
const compVNode = h(ParentComponent)
render(compVNode, document.getElementById('app'))
```
我们把子组件改成函数式组件，2s后改变`localState`的值，这时我们期望子组件的`text`跟着变化。回顾一下之前我们挂载函数式组件的代码。
```javascript
function mountFunctionalComponent(vnode, container, isSVG) {
  // 获取 VNode
  const $vnode = vnode.tag()
  // 挂载
  mount($vnode, container, isSVG)
  // el 元素引用该组件的根元素
  vnode.el = $vnode.el
}
```
为了实现让`props`在子组件传递，我们改动一下代码
```javascript
function mountFunctionalComponent(vnode, container, isSVG) {
  // 获取 props，父组件的data
  const props = vnode.data
  // 获取 VNode，把 props 传给函数式组件，这样组件内部就可以使用 props
  const $vnode = (vnode.children = vnode.tag(props))
  
  // 挂载
  mount($vnode, container, isSVG)
  // el 元素引用该组件的根元素
  vnode.el = $vnode.el
}
```
我们这里把`vnode.tag(props)`传给了`vnode.children`，在有状态组件中`vnode.children`存的是实例，而在函数式组件中没有实例，所以我们在这里存所产出的`VNode`。  
结下来我们来回顾`patchComponent`
```javascript
function patchComponent(prevVNode, nextVNode, container) {
  if (nextVNode.tag !== prevVNode.tag) {
    replaceVNode(prevVNode, nextVNode, container)
  } else if (nextVNode.flags & VNodeFlags.COMPONENT_STATEFUL_NORMAL) {
    // 省略...
  } else {
    // 在这里编写函数式组件的更新逻辑
  }
}
```
和有状态组件思路一样，我们需要封装一个 `_update` 方法来更新，但是函数式组件不是实例，无法挂载方法，所以我们需要修改一下`mountFunctionalComponent`
```javascript
function mountFunctionalComponent(vnode, container, isSVG) {
  // 在函数式组件类型的 vnode 上添加 handle 属性，它是一个对象
  vnode.handle = {
    prev: null,
    next: vnode,
    container,
    update: () => {
      // 初始化 props
      const props = vnode.data
      // 获取 VNode
      const $vnode = (vnode.children = vnode.tag(props))
      // 挂载
      mount($vnode, container, isSVG)
      // el 元素引用该组件的根元素
      vnode.el = $vnode.el
    }
  }

  // 立即调用 vnode.handle.update 完成初次挂载
  vnode.handle.update()
}
```
我们在函数式组件类型的 `vnode` 上添加 `handle` 属性，里面存着相关的信息和`update`方法。  

- `handle.prev`：存储旧的函数式组件 `VNode`，在初次挂载时，没有旧的 `VNode` 可言，所以初始值为 null。
- `handle.next`：存储新的函数式组件 `VNode`，在初次挂载时，就为本身
- `handle.container`：存储的是挂载容器
 
现在有了`update`方法，我可以对`patchComponent`进行改造。
```javascript
function patchComponent(prevVNode, nextVNode, container) {
  if (nextVNode.tag !== prevVNode.tag) {
    replaceVNode(prevVNode, nextVNode, container)
  } else if (nextVNode.flags & VNodeFlags.COMPONENT_STATEFUL_NORMAL) {
    // 省略...
  } else {
    // 更新函数式组件
    // 拿到 handle 对象，并赋值给最新的VNode
    const handle = (nextVNode.handle = prevVNode.handle);
    // 更新 handle 对象
    handle.prev = prevVNode;
    handle.next = nextVNode;
    handle.container = container;
    
    handle.update();
  }
}
```
回到`mountFunctionalComponent`方法，现在里面的 `update` 方法只能完成初次挂载的工作，所以我们要增加更新的操作。
```javascript
function mountFunctionalComponent(vnode, container, isSVG) {
  // 在函数式组件类型的 vnode 上添加 handle 属性，它是一个对象
  vnode.handle = {
    prev: null,
    next: vnode,
    container,
    update: () => {
      // 如果存在 prev 属性，说明不是第一次挂载
      if (vnode.handle.prev) {
        // 更新
        // prevVNode 是旧的组件VNode，nextVNode 是新的组件VNode
        const prevVNode = vnode.handle.prev
        const nextVNode = vnode.handle.next
        // prevTree 是组件产出的旧的 VNode，我们之前把实例保存在 children 里
        const prevTree = prevVNode.children
        // 更新 props 数据
        const props = nextVNode.data
        // nextTree 是组件产出的新的 VNode
        const nextTree = (nextVNode.children = nextVNode.tag(props))
        // 调用 patch 函数更新
        patch(prevTree, nextTree, vnode.handle.container)
      } else {
        // 初始化 props
        const props = vnode.data
        // 获取 VNode
        const $vnode = (vnode.children = vnode.tag(props))
        // 挂载
        mount($vnode, container, isSVG)
        // el 元素引用该组件的根元素
        node.el = $vnode.el
      }
      
    }
  }

  // 立即调用 vnode.handle.update 完成初次挂载
  vnode.handle.update()
}
```
这样我们就完成了函数式组件的挂载。

