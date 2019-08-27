# vue3 渲染器详解（一）

## 前言
渲染器是vue的核心，控制着vue生命周期里视图的挂载、更新和渲染。vue在它的第三个版本`vue3`里重写了整个虚拟DOM也就是渲染器的代码，使之可以用更有效的代码来创建虚拟节点。所以这篇我们的主题就是深度理解`vue3`渲染器的原理，并且根据`vue3`的思想手写一个渲染器。因为篇幅较多，所以可能会分两到三篇的文章来剖析它的核心。

## 一、概述
在`vue`中，渲染器分别做了这几个事情，创建VNode（`h函数`）、挂载（`mount`）、渲染（`render`）、更新（`patch`）。还有在`patch`里面包含了核心`diff算法`。

## 二、设计VNode
一个`html`标签有它的名字、属性、事件、样式、子节点等，这些内容都是需要在VNode里面体现，比如用下面这个对象来描述一个 div 标签
```javascript
const elementVNode = {
    tag: 'div',
    data: {
        style: {
            width: '300px',
            height: '300px',
            background: '#000000'
        }
    },
    children: [
        { tag: 'div', data: null },
        { tag: 'div', data: null }
    ]
}
```
使用`tag`来保存标签名字，用`data`来保存附加信息，比如`class`、`style`、事件等，用`children`保存子节点。若只有一个子节点`children`则是一个对象。如果有多个子节点，它也可以是一个数组。除了标签元素之外，DOM 中还有文本节点
```javascript
const textVNode = {
    tag: null,
    data: null,
    children: '文本节点'
}
```
如上，由于文本节点没有标签名字，所以它的 tag 属性值为 null。由于文本节点也无需用额外的 VNodeData 来描述附加属性，所以其 data 属性值也是 null。

VNode 可以描述不同的事物，总的来说我们可以分为这5种情况。  
![](https://user-gold-cdn.xitu.io/2019/8/26/16ccbcff6e09e2fd?w=1560&h=672&f=png&s=69572)
Fragment 和 Portal是比较特殊的组件，当渲染器在渲染 VNode 时，如果发现该 VNode 的类型是 Fragment，就只需要把该 VNode 的子节点渲染到页面。就相当于 vue2 里面的 template 标签。再来看看 Portal，它允许你把内容渲染到任何地方。什么意思呢，看个例子
```html
<template>
    // Portal 把里面的内容挂载到 #app-root
  <Portal target="#app-root">
    <div class="overlay"></div>
  </Portal>
</template>
```

我们需要一个标识`flags`来区分各种情况，在 javascript 里就用一个对象来表示即可：
```javascript
const VNodeFlags = {
  // html 标签
  ELEMENT_HTML: 1,
  // SVG 标签
  ELEMENT_SVG: 1 << 1,

  // 普通有状态组件
  COMPONENT_STATEFUL_NORMAL: 1 << 2,
  // 需要被keepAlive的有状态组件
  COMPONENT_STATEFUL_SHOULD_KEEP_ALIVE: 1 << 3,
  // 已经被keepAlive的有状态组件
  COMPONENT_STATEFUL_KEPT_ALIVE: 1 << 4,
  // 函数式组件
  COMPONENT_FUNCTIONAL: 1 << 5,

  // 纯文本
  TEXT: 1 << 6,
  // Fragment
  FRAGMENT: 1 << 7,
  // Portal
  PORTAL: 1 << 8
}

```
我们注意到，这些枚举属性的值基本都是通过将十进制数字 1 左移不同的位数得来的。根据这些基本的枚举属性值，我们还可以派生出额外的三个标识：
```javascript
// html 和 svg 都是标签元素，所以可以用 ELEMENT 表示
VNodeFlags.ELEMENT = VNodeFlags.ELEMENT_HTML | VNodeFlags.ELEMENT_SVG;
// 有状态组件，统一用 COMPONENT_STATEFUL 表示
VNodeFlags.COMPONENT_STATEFUL = 
 | VNodeFlags.COMPONENT_STATEFUL_NORMAL
 | VNodeFlags.COMPONENT_STATEFUL_SHOULD_KEEP_ALIVE
 | VNodeFlags.COMPONENT_STATEFUL_KEPT_ALIVE;
// 有状态组件 和  函数式组件都是“组件”，用 COMPONENT 表示
VNodeFlags.COMPONENT = VNodeFlags.COMPONENT_STATEFUL | COMPONENT_FUNCTIONAL
```
这样在挂载或 patch 阶段通过 flags 可以直接避免掉很多消耗性能的判断，我们先提前感受一下渲染器的代码：
```javascript
if (flags & VNodeFlags.ELEMENT) {
  // VNode 是普通标签
  mountElement(/* ... */)
} else if (flags & VNodeFlags.COMPONENT) {
  // VNode 是组件
  mountComponent(/* ... */)
} else if (flags & VNodeFlags.TEXT) {
  // VNode 是纯文本
  mountText(/* ... */)
}
```
我们采用位运算来判断种类，因为在一次挂载任务中这种判断很可能大量的进行，使用位运算在一定程度上再次拉升了运行时性能，相比而言，位掩码的运算速度远比直接判断 ```===``` 运算的高，除却函数调用带来额外开销，位运算发生于系统底层。  
把```VNodeFlags```整理成表格的话，我们就能很清楚的理解为什么可以用位操作符 & 来判断。
| VNodeFlags | 左移运算 | 32位的bit序列 |
| :------| ------: | :------: |
| ELEMENT_HTML | 无 | 00000000`1` |
| ELEMENT_SVG | 1 << 1 | 0000000`1`0 |
| COMPONENT_STATEFUL_NORMAL | 1 << 2 | 000000`1`00 |
| COMPONENT_STATEFUL_SHOULD_KEEP_ALIVE | 1 << 3 | 00000`1`000 |
| COMPONENT_STATEFUL_KEPT_ALIVE | 1 << 4 | 0000`1`0000 |
| COMPONENT_FUNCTIONAL | 1 << 5 | 000`1`00000 |
| TEXT | 1 << 6 | 00`1`000000 |
| FRAGMENT | 1 << 7 | 0`1`0000000 |
| PORTAL | 1 << 8 | `1`00000000 |
根据上表展示的基本 flags 值可以很容易地得出下表：

| VNodeFlags | 32位的bit序列 |
| ------ | ------ |
| ELEMENT | 0000000`1` `1` |
| COMPONENT_STATEFUL | 0000`1` `1` `1`00|
| COMPONENT | 000`1` `1` `1` `1`00|
所以可以看出只有`VNodeFlags.ELEMENT_HTML`和```VNodeFlags.ELEMENT_SVG```与
```VNodeFlags.ELEMENT``` 进行位与（&）运算，才会得到非零值，即为真。

##### ChildrenFlags
同样的我们需要定义一下 children 的flags
```javascript
const ChildrenFlags = {
  // 未知的 children 类型
  UNKNOWN_CHILDREN: 0,
  // 没有 children
  NO_CHILDREN: 1,
  // children 是单个 VNode
  SINGLE_VNODE: 1 << 1,
  // children 是多个拥有 key 的 VNode
  KEYED_VNODES: 1 << 2,
  // children 是多个没有 key 的 VNode
  NONE_KEYED_VNODES: 1 << 3
}
```
至此，我们已经对 VNode 完成了一定的设计，目前为止我们所设计的 VNode 对象如下：
```javascript
export interface VNode {
  // _isVNode 属性在上文中没有提到，它是一个始终为 true 的值，有了它，我们就可以判断一个对象是否是 VNode 对象
  _isVNode: true
  // el 属性在上文中也没有提到，当一个 VNode 被渲染为真实 DOM 之后，el 属性的值会引用该真实DOM
  el: Element | null
  flags: VNodeFlags
  tag: string | FunctionalComponent | ComponentClass | null
  data: VNodeData | null
  children: VNodeChildren
  childFlags: ChildrenFlags
}
```
## 三、创建VNode的h函数
前面我们已经设计好了 VNode，接下来我们就需要使用 h 函数来创建VNode。  
h函数传入三个参数，```tag```、```data``` 和 ```children```，对于 ```flags``` 属性，我们可以通过检查 ```tag``` 属性值的特征来确定该 ```VNode``` 的 ```flags``` 属性值。
```javascript
export const Fragment = Symbol();
export const Portal = Symbol();
function h(tag, data = null, children = null) {
  let flags = null
  if (typeof tag === 'string') {
    flags = tag === 'svg' ? VNodeFlags.ELEMENT_SVG : VNodeFlags.ELEMENT_HTML
  } else if (tag === Fragment) {
    flags = VNodeFlags.FRAGMENT
  } else if (tag === Portal) {
    flags = VNodeFlags.PORTAL
    tag = data && data.target
  } else {
    // 兼容 Vue2 的对象式组件
    if (tag !== null && typeof tag === 'object') {
      flags = tag.functional
        ? VNodeFlags.COMPONENT_FUNCTIONAL       // 函数式组件
        : VNodeFlags.COMPONENT_STATEFUL_NORMAL  // 有状态组件
    } else if (typeof tag === 'function') {
      // Vue3 的类组件
      flags = tag.prototype && tag.prototype.render
        ? VNodeFlags.COMPONENT_STATEFUL_NORMAL  // 有状态组件
        : VNodeFlags.COMPONENT_FUNCTIONAL       // 函数式组件
    }
  }
}
```
对于 Fragment 和 Portal 类型的 VNode，我们可以创建两个 Symbol 来作为唯一的标识。
这时我们可以像如下这样调用 h 函数创建 Fragment：
```javascript
import { h, Fragment } from 'vue'

h(Fragment, null, children)
```
接下来我们来确定 children 的类型  
上文通过 检测 tag 属性值 来确定一个 VNode 对象的 flags 属性值。类似地，可以通过 检测 children 来确定 childFlags 的值。根据 h 函数的调用方式可以很容易地确定参数 children 包含哪些值：
```javascript
function h(tag, data = null, children = null) {
  // 省略用于确定 flags 相关的代码

  let childFlags = null
  if (Array.isArray(children)) {
    const { length } = children
    if (length === 0) {
      // 没有 children
      childFlags = ChildrenFlags.NO_CHILDREN
    } else if (length === 1) {
      // 单个子节点
      childFlags = ChildrenFlags.SINGLE_VNODE
      children = children[0]
    } else {
      // 多个子节点，且子节点使用key
      childFlags = ChildrenFlags.KEYED_VNODES
      children = normalizeVNodes(children)
    }
  } else if (children == null) {
    // 没有子节点
    childFlags = ChildrenFlags.NO_CHILDREN
  } else if (children._isVNode) {
    // 单个子节点
    childFlags = ChildrenFlags.SINGLE_VNODE
  } else {
    // 其他情况都作为文本节点处理，即单个子节点，会调用 createTextVNode 创建纯文本类型的 VNode
    childFlags = ChildrenFlags.SINGLE_VNODE
    children = createTextVNode(children + '')
  }
}
```
这边可能有个疑问，为什么多个子节点时会直接被当做使用了 key 的子节点？这是因为 key 是可以人为创造的，我们通过 key 在 ```patch``` 阶段快速找到不同，所以如果一个列表用户没用传 key 属性的话，我们会给他一个默认的key，如下是 normalizeVNodes 函数的简化：
```javascript
function normalizeVNodes(children) {
  const newChildren = []
  // 遍历 children
  for (let i = 0; i < children.length; i++) {
    const child = children[i]
    if (child.key == null) {
      // 如果原来的 VNode 没有key，则使用竖线(|)与该VNode在数组中的索引拼接而成的字符串作为key
      child.key = '|' + i
    }
    newChildren.push(child)
  }
  // 返回新的children，此时 children 的类型就是 ChildrenFlags.KEYED_VNODES
  return newChildren
}
```
```javascript
function createTextVNode(text) {
  return {
    _isVNode: true,
    // flags 是 VNodeFlags.TEXT
    flags: VNodeFlags.TEXT,
    tag: null,
    data: null,
    // 纯文本类型的 VNode，其 children 属性存储的是与之相符的文本内容
    children: text,
    // 文本节点没有子节点
    childFlags: ChildrenFlags.NO_CHILDREN,
    el: null
  }
}
```
经过上面处理后就可以创建一个 VNode 对象，完整代码如下：
```javascript
import { VNodeFlags, ChildrenFlags } from './flags'

export const Fragment = Symbol();
export const Portal = Symbol();
export function h(tag, data = null, children = null) {
  // 确定 flags
  let flags = null;
  if (typeof tag === 'string') {
    flags = tag === 'svg' ? VNodeFlags.ELEMENT_SVG : VNodeFlags.ELEMENT_HTML
  } else if (tag === Fragment) {
    flags = VNodeFlags.FRAGMENT;
  } else if (tag === Portal) {
    flags = VNodeFlags.PORTAL
    tag = data && data.target
  } else {
    if (tag !== null && typeof tag === 'object') {
      // 兼容 Vue2 的对象式组件
      flags = tag.functional
        ? VNodeFlags.COMPONENT_FUNCTIONAL
        : VNodeFlags.COMPONENT_STATEFUL_NORMAL;
    } else if(typeof tag === 'function') {
      // Vue3 的类组件
      flags = tag.prototype && tag.prototype.render
        ? VNodeFlags.COMPONENT_STATEFUL_NORMAL
        : VNodeFlags.COMPONENT_FUNCTIONAL;
    }
  }

  // 确定 childFlags
  let childFlags = null;
  if (Array.isArray(children)) {
    const { length } = children;
    if (length === 0) {
      // 没有 children
      childFlags = VNodeFlags.NO_CHILDREN;
    } else if (length === 1) {
      // 单个子节点
      childFlags = VNodeFlags.SINGLE_VNODE;
      children = children[0];
    } else {
      // 多个子节点，且子节点使用key
      childFlags = ChildrenFlags.KEYED_VNODES;
      children = normalizeVNodes(children);
    }
  } else if (children === null) {
    childFlags = VNodeFlags.NO_CHILDREN;
  } else if (children._isVNode) {
    // 单个子节点
    childFlags = ChildrenFlags.SINGLE_VNODE;
  } else {
    // 其他情况都作为文本节点处理，即单个子节点，会调用 createTextVNode 创建纯文本类型的 VNode
    childFlags = ChildrenFlags.SINGLE_VNODE;
    children = createTextVNode(children + '');
  }
  return {
    _isVNode: true,
    flags,
    tag,
    data,
    children,
    childFlags,
    el: null
  }
}
```

## 四、渲染器
所谓渲染器，简单的说就是将 Virtual DOM（以下简称VNode） 渲染成特定平台下真实
DOM 的工具，渲染器是 vue 的核心（通常叫做```render```），渲染器的分为两个阶段：```mount``` 和 ```patch```，mount就是把VNode挂载到真实```DOM```的一个操作，patch就是使用新的 VNode 与旧的 VNode 进行对比，用最少的资源实现```DOM```更新，也叫做“打补丁”。渲染器接受两个参数，第一个是将要被渲染的```VNode```，第二个是用来承载内容的```container```，通常也叫挂载点。如下代码所示：
```javascript
function render(vnode, container) {
  const prevVNode = container.vnode;
  if (prevVNode === null) {
    // 没有旧的 VNode，只有新的 VNode。使用 `mount` 函数挂载全新的 VNode
    if (vnode) {
      mount(vnode, container);
      // 将新的 VNode 添加到 container.vnode 属性下，这样下一次渲染时旧的 VNode 就存在了
      container.vnode = vnode;
    }
  } else {
    if (vnode) {
      // 如果有新的 VNode 使用 patch 进行对比
      patch(prevVNode, vnode, container);
      container.vnode = vnode;
    } else {
      container.removeChild(prevVNode.el);
      container.vnode = null;
    }
  }
}
```
mount 挂载函数的作用是把一个 VNode 渲染成真实 DOM，根据不同类型的 VNode 需要采用不同的挂载方式，如下：
```javascript
function mount(vnode, container, isSVG) {
  const { flags } = vnode
  if (flags & VNodeFlags.ELEMENT) {
    // 挂载普通标签
    mountElement(vnode, container, isSVG)
  } else if (flags & VNodeFlags.COMPONENT) {
    // 挂载组件
    mountComponent(vnode, container, isSVG)
  } else if (flags & VNodeFlags.TEXT) {
    // 挂载纯文本
    mountText(vnode, container)
  } else if (flags & VNodeFlags.FRAGMENT) {
    // 挂载 Fragment
    mountFragment(vnode, container, isSVG)
  } else if (flags & VNodeFlags.PORTAL) {
    // 挂载 Portal
    mountPortal(vnode, container, isSVG)
  }
}
```
根据 VNode 的 flags 来调用具体的挂载方法
![](https://user-gold-cdn.xitu.io/2019/8/26/16cccd83a0a3b725?w=1576&h=302&f=png&s=44285)

#### mountElement
我们首先编写一下 mountElement 方法
```javascript
function mountElement(vnode, container) {
  const el = document.createElement(vnode.tag)
  vnode.el = el
  container.appendChild(el)
}
```
原理很简单，先创建元素然后把元素添加进去，但是有几个问题
1. 没有将 ```VNodeData``` 应用到真实DOM元素上
2. 没有继续挂载子节点，即 ```children```
3. 不能严谨地处理 SVG 标签

对于第一个问题，我们知道 ```VNodeData``` 是用来描述```VNode```，理面保存了```class```、```style```、事件等属性。所以我们需要对它进行遍历
```javascript
function mountElement(vnode, container) {
  const el = document.createElement(vnode.tag)
  vnode.el = el
  // 拿到 VNodeData
  const data = vnode.data
  if (data) {
      // 如果 VNodeData 存在，则遍历
      for (let key in data) {
          // key 可能是 class、style、on 等等
          switch(key) {
              case 'style':
              // 把style一个个遍历到内联样式上
              for (let k in data.style) {
                  el.style[k] = data.style[k]
              }
              break
          }
      }
  }
  container.appendChild(el)
}
```
对于class 和 on 等其他属性我们用同样的方法处理，这里就不一一写出来。  

第二个问题：没有挂载子节点
```javascript
function mountElement(vnode, container) {
  const el = document.createElement(vnode.tag)
  vnode.el = el
  // 省略处理 VNodeData 相关的代码

  // 拿到 children 和 childFlags
  const childFlags = vnode.childFlags
  const children = vnode.children
  // 检测如果没有子节点则无需递归挂载
  if (childFlags !== ChildrenFlags.NO_CHILDREN) {
    if (childFlags & ChildrenFlags.SINGLE_VNODE) {
      // 如果是单个子节点则调用 mount 函数挂载
      mount(children, el)
    } else if (childFlags & ChildrenFlags.MULTIPLE_VNODES) {
      // 如果是单多个子节点则遍历并调用 mount 函数挂载
      for (let i = 0; i < children.length; i++) {
        mount(children[i], el)
      }
    }
  }

  container.appendChild(el)
}
```
我们通过 vnode.childFlags 拿到该 VNode 子节点的类型，接着检测其是否含有子节点，如果存在子节点，会检测是单个子节点还是多个子节点，只有当存在多个子节点时其 children 属性才是可遍历的数组，最后调用 mount 函数挂载。

第三个问题：不能严谨地处理 SVG 标签
在之前的 mountElement 函数中我们使用 document.createElement 函数创建DOM元素，但是对于 SVG 标签，更加严谨的方式是使用 document.createElementNS 函数：
```javascript
function mountElement(vnode, container) {
  const isSVG = vnode.flags & VNodeFlags.ELEMENT_SVG
  const el = isSVG
    ? document.createElementNS('http://www.w3.org/2000/svg', vnode.tag)
    : document.createElement(vnode.tag)
  vnode.el = el
  // 省略...
}
```
在之前我们定义 h 函数的时候，是通过判断 tag 的字符串是否为 svg，但是有一个问题，如果svg的子元素不会被标记为 svg 比如 ```<circle/>```，所以它在这里不会使用 createElementNS 来创建，解决办法很简单，因为 svg 的书写总是以 ```<svg>``` 标签开始的，所有其他 svg 相关的标签都是 ```<svg>``` 标签的子代元素。所以在 mountElement 函数中一旦 isSVG 为真，那么后续创建的所有子代元素都会被认为是 svg 标签，我们给 mountElement 添加一个参数 isSvg
```javascript
function mountElement(vnode, container, isSVG) {
  isSVG = isSVG || vnode.flags & VNodeFlags.ELEMENT_SVG
  const el = isSVG
    ? document.createElementNS('http://www.w3.org/2000/svg', vnode.tag)
    : document.createElement(vnode.tag)
  // 省略处理 VNodeData 的代码

  const childFlags = vnode.childFlags
  if (childFlags !== ChildrenFlags.NO_CHILDREN) {
    if (childFlags & ChildrenFlags.SINGLE_VNODE) {
      // 这里需要把 isSVG 传递下去
      mount(children, el, isSVG)
    } else if (childFlags & ChildrenFlags.MULTIPLE_VNODES) {
      for (let i = 0; i < children.length; i++) {
        // 这里需要把 isSVG 传递下去
        mount(children[i], el, isSVG)
      }
    }
  }

  container.appendChild(el)
}
```
这样我们就完成了 mountElement 方法。
```javascript
function mountElement(vnode, container, isSVG) {
  isSVG = isSVG || vnode.flags & VNodeFlags.ELEMENT_SVG
  const el = isSVG
    ? document.createElementNS('http://www.w3.org/2000/svg', vnode.tag)
    : document.createElement(vnode.tag)
  vnode.el = el
  // 拿到 VNodeData
  const data = vnode.data;
  const domPropsRE = /\W|^(?:value|checked|selected|muted)$/
  if (data) {
    for (let key in data) {
      switch (key) {
        case 'style':
          for (let k in data.style) {
            el.style[k] = data.style[k]
          }
          break
        case 'class':
          if (isSVG) {
            el.setAttribute('class', data[key])
          } else {
            el.className = data[key]
          }
          break
        default:
          if (key[0] === 'o' && key[1] === 'n') {
            // 事件
            el.addEventListener(key.slice(2), data[key])
          } else if (domPropsRE.test(key)) {
            // 当作 DOM Prop 处理
            el[key] = data[key]
          } else {
            // 当作 Attr 处理
            el.setAttribute(key, data[key])
          }
          break
      }
    }
  }
  // 拿到 children 和 childFlags
  const childFlags = vnode.childFlags
  const children = vnode.children
  // 检测如果没有子节点则无需递归挂载
  if (childFlags !== ChildrenFlags.NO_CHILDREN) {
    if (childFlags & ChildrenFlags.SINGLE_VNODE) {
      // 如果是单个子节点则调用 mount 函数挂载
      mount(children, el, isSVG)
    } else if (childFlags & ChildrenFlags.MULTIPLE_VNODES) {
      // 如果是单多个子节点则遍历并调用 mount 函数挂载
      for (let i = 0; i < children.length; i++) {
        mount(children[i], el, isSVG)
      }
    }
  }
  container.appendChild(el)
}
```
#### 挂载纯文本、Fragment 和 Portal
挂载文本很简单，不需要处理其他东西
``` javascript
function mountText(vnode, container) {
  const el = document.createTextNode(vnode.children)
  vnode.el = el
  container.appendChild(el)
}
```
挂载Fragment，和 mountElement 的区别在于，它只挂载一个 VNode 的 children，不需要考虑 VNodeData，所以也比较简单。
``` javascript
function mountFragment(vnode, container, isSVG) {
  // 拿到 children 和 childFlags
  const { children, childFlags } = vnode
  switch (childFlags) {
    case ChildrenFlags.SINGLE_VNODE:
      // 如果是单个子节点，则直接调用 mount
      mount(children, container, isSVG)
      break
    case ChildrenFlags.NO_CHILDREN:
      // 如果没有子节点，等价于挂载空片段，会创建一个空的文本节点占位
      const placeholder = createTextVNode('')
      mountText(placeholder, container)
      break
    default:
      // 多个子节点，遍历挂载之
      for (let i = 0; i < children.length; i++) {
        mount(children[i], container, isSVG)
      }
  }
}
```
挂载Portal时，获取到挂载点`taget`，然后直接把`children`挂载到taget上就可以了
```javascript
function mountPortal(vnode, container) {
  const { tag, children, childFlags } = vnode

  // 获取挂载点
  const target = typeof tag === 'string' ? document.querySelector(tag) : tag

  if (childFlags & ChildrenFlags.SINGLE_VNODE) {
    // 将 children 挂载到 target 上，而非 container
    mount(children, target)
  } else if (childFlags & ChildrenFlags.MULTIPLE_VNODES) {
    for (let i = 0; i < children.length; i++) {
      // 将 children 挂载到 target 上，而非 container
      mount(children[i], target)
    }
  }
  
  // 占位的空文本节点
  const placeholder = createTextVNode('')
  // 将该节点挂载到 container 中
  mountText(placeholder, container, null)
  // el 属性引用该节点
  vnode.el = placeholder.el
}
```
#### 挂载有状态组件
组件又分为有状态和无状态，我们通过 flags 分别进行处理
```javascript
function mountComponent(vnode, container, isSVG) {
  if (vnode.flags & VNodeFlags.COMPONENT_STATEFUL) {
    mountStatefulComponent(vnode, container, isSVG)
  } else {
    mountFunctionalComponent(vnode, container, isSVG)
  }
}
```
挂载一个有状态组件只需要四步，如下是 mountStatefulComponent 函数的实现：
```javascript
function mountStatefulComponent(vnode, container, isSVG) {
  // 创建组件实例
  const instance = new vnode.tag();
  // 渲染 VNode
  instance.$vnode = instance.render()
  // 挂载
  mount(instance.$vnode, container, isSVG);
  // el 属性值 和 组件实例的 $el 属性都引用组件的根DOM元素
  instance.$el = vnode.el = instance.$vnode.el
}
```
如果一个 `VNode` 描述的是有状态组件，那么 `vnode.tag` 属性值就是组件类的引用，所以通过 `new` 关键字创建组件实例。一个组件的核心就是其 render 函数，通过调用 `render` 函数可以拿到该组件要渲染的内容。  
函数式组件就更简单了，它就是一个返回 `VNode` 的函数：
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
#### 小结
mount是vue3 渲染器中非常重要的一环，我们在浏览器看到的内容都必须经过它来进行挂载，后面我们讲的 `patch` 也大量调用了`mount`。
