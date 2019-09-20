import { VNodeFlags, ChildrenFlags } from './flags'
import { mount } from './render'
import diff from './diff'

export function patch(prevVNode, nextVNode, container) {
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


function replaceVNode (prevVNode, nextVNode, container) {
  // 移除旧的VNode
  container.removeChild(prevVNode.el);
  // 在把新的挂载到 container
  mount(nextVNode, container)
}

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

  // 调用 patchChildren 函数递归地更新子节点
  patchChildren(
    prevVNode.childFlags, // 旧的 VNode 子节点的类型
    nextVNode.childFlags, // 新的 VNode 子节点的类型
    prevVNode.children,   // 旧的 VNode 子节点
    nextVNode.children,   // 新的 VNode 子节点
    el                    // 当前标签元素，即这些子节点的父节点
  )
}

// 更新VNodeData
const domPropsRE = /\W|^(?:value|checked|selected|muted)$/
export function patchData(el, key, prevValue, nextValue) {
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
        // el.addEventListener(key.slice(2), nextValue)
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

// 更新子节点
function patchChildren(
  prevChildFlags,
  nextChildFlags,
  prevChildren,
  nextChildren,
  container
) {
  switch (prevChildFlags) {
    // 旧的 children 是单个子节点，会执行该 case 语句块
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
    case ChildrenFlags.NO_CHILDREN:
      switch (nextChildFlags) {
        case ChildrenFlags.SINGLE_VNODE:
          // 新的 children 是单个子节点时，直接挂载
          mount(nextChildren, container)
          break;
        case ChildrenFlags.NO_CHILDREN:
          // 新旧 VNode 都没有 children ，我们什么都不做
          break;
        default:
          // 新的 children 中有多个子节点时，循环挂载
          for(let i = 0; i < nextChildren.length; i++) {
            mount(nextChildren[i], container)
          }
          break;
      }
      break;
    default:
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
        // diff
        diff(prevChildren, nextChildren, container);
        break;
      }
      break;
  }
}

// 文本节点更新
function patchText(prevVNode, nextVNode) {
  // 拿到文本元素 el，同时让 nextVNode.el 指向该文本元素
  const el = (nextVNode.el = prevVNode.el)
  // 只有当新旧文本内容不一致时才有必要更新
  if (nextVNode.children !== prevVNode.children) {
      el.nodeValue = nextVNode.children
  }
}

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
  } else {
    // 更新函数式组件
    // 拿到 handel 对象，并赋值给最新的VNode
    const handle = (nextVNode.handle = prevVNode.handle);
    // 更新 handel 对象
    handle.prev = prevVNode;
    handle.next = nextVNode;
    handle.container = container;
    
    handle.update();
  }
}