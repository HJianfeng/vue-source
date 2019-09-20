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

function mount(vnode, container, isSVG, refNode) {
  const { flags } = vnode

  if (flags & VNodeFlags.ELEMENT) {
    // 挂载普通标签
    mountElement(vnode, container, isSVG, refNode)
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

function mountElement(vnode, container, isSVG, refNode) {
  isSVG = isSVG || vnode.flags & VNodeFlags.ELEMENT_SVG
  const el = isSVG
    ? document.createElementNS('http://www.w3.org/2000/svg', vnode.tag)
    : document.createElement(vnode.tag)
  vnode.el = el

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
  refNode ? container.insertBefore(el, refNode) : container.appendChild(el)
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
  const instance = (vnode.children = new vnode.tag())
  // 初始化 props 新增
  instance.$props = vnode.data
  
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
        vnode.el = $vnode.el
      }
      
    }
  }

  // 立即调用 vnode.handle.update 完成初次挂载
  vnode.handle.update()
}



export { render, mount };