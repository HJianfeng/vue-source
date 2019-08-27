import { VNodeFlags, ChildrenFlags } from './flags'
import { patch, patchData } from './patch'
import { createTextVNode } from './h'

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

function mountElement(vnode, container, isSVG) {
  isSVG = isSVG || vnode.flags & VNodeFlags.ELEMENT_SVG
  const el = isSVG
    ? document.createElementNS('http://www.w3.org/2000/svg', vnode.tag)
    : document.createElement(vnode.tag)
  vnode.el = el
  // 拿到 VNodeData
  // const data = vnode.data;
  // const domPropsRE = /\W|^(?:value|checked|selected|muted)$/
  // if (data) {
  //   for (let key in data) {
  //     switch (key) {
  //       case 'style':
  //         for (let k in data.style) {
  //           el.style[k] = data.style[k]
  //         }
  //         break
  //       case 'class':
  //         if (isSVG) {
  //           el.setAttribute('class', data[key])
  //         } else {
  //           el.className = data[key]
  //         }
  //         break
  //       default:
  //         if (key[0] === 'o' && key[1] === 'n') {
  //           // 移除旧事件
  //           if (prevValue) {
  //             el.removeEventListener(key.slice(2), prevValue)
  //           }
  //           // 添加新事件
  //           if (nextValue) {
  //             el.addEventListener(key.slice(2), nextValue)
  //           }
  //         } else if (domPropsRE.test(key)) {
  //           // 当作 DOM Prop 处理
  //           el[key] = data[key]
  //         } else {
  //           // 当作 Attr 处理
  //           el.setAttribute(key, data[key])
  //         }
  //         break
  //     }
  //   }
  // }

  // 使用封装后的 patchData
  const data = vnode.data
  if (data) {
    for (let key in data) {
      patchData(el, key, null, data[key])
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
// 挂载文本
function mountText(vnode, container) {
  const el = document.createTextNode(vnode.children)
  vnode.el = el
  container.appendChild(el)
}

// 挂载Fragment
function mountFragment(vnode, container, isSVG) {
  const { children, childFlags } = vnode
  switch (childFlags) {
    case ChildrenFlags.SINGLE_VNODE:
      mount(children, container, isSVG)
      // 单个子节点，就指向该节点
      vnode.el = children.el
      break
    case ChildrenFlags.NO_CHILDREN:
      const placeholder = createTextVNode('')
      mountText(placeholder, container)
      // 没有子节点指向占位的空文本节点
      vnode.el = placeholder.el
      break
    default:
      for (let i = 0; i < children.length; i++) {
        mount(children[i], container, isSVG)
      }
      // 多个子节点，指向第一个子节点
      vnode.el = children[0].el
  }
}
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
  // 虽然 Portal 的内容可以被渲染到任意位置，但它的行为仍然像普通的DOM元素一样，
  // 如事件的捕获/冒泡机制仍然按照代码所编写的DOM结构实施。
  // 要实现这个功能就必须需要一个占位的DOM元素来承接事件。所以我们用一个空的文本节点占位即可

  // 占位的空文本节点
  const placeholder = createTextVNode('')
  // 将该节点挂载到 container 中
  mountText(placeholder, container, null)
  // el 属性引用该节点
  vnode.el = placeholder.el
}

function mountComponent(vnode, container, isSVG) {
  if (vnode.flags & VNodeFlags.COMPONENT_STATEFUL) {
    mountStatefulComponent(vnode, container, isSVG)
  } else {
    mountFunctionalComponent(vnode, container, isSVG)
  }
}
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
function mountFunctionalComponent(vnode, container, isSVG) {
  // 获取 VNode
  const $vnode = vnode.tag()
  // 挂载
  mount($vnode, container, isSVG)
  // el 元素引用该组件的根元素
  vnode.el = $vnode.el
}



export { render, mount };