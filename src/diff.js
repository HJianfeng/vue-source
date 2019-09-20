import { VNodeFlags, ChildrenFlags } from './flags'
import { mount } from './render'
import { patch } from './patch'

export default function diff (
  prevChildren,
  nextChildren,
  container
 ) {
  // 用来存储寻找过程中遇到的最大索引值
  let lastIndex = 0
  // 遍历新的 children
  for (let i = 0; i < nextChildren.length; i++) {
    const nextVNode = nextChildren[i]
    let j = 0,
        find = false;
    // 遍历旧的 children
    for (j; j < prevChildren.length; j++) {
      const prevVNode = prevChildren[j]
      // 如果找到了具有相同 key 值的两个节点，则调用 `patch` 函数更新之
      if (nextVNode.key === prevVNode.key) {
        find = true;
        patch(prevVNode, nextVNode, container)
        if (j < lastIndex) {
          // 需要移动
          // refNode 是为了下面调用 insertBefore 函数准备的
          const refNode = nextChildren[i-1].el.nextSibling
          // 调用 insertBefore 把可复用的旧节点插入到 refNode
          // 的前面,也就是nextChildren[i - 1]的后面。
          container.insertBefore(prevVNode.el, refNode)
        } else {
          // 更新 lastIndex
          lastIndex = j
        }
        break // 这里需要 break
      }
    }
    if (!find) {
      // 挂载新节点
      mount(nextVNode, container, false)
    }
  }
  for (let i = 0; i < prevChildren.length; i++) {
    const prevVNode = prevChildren[i]
    // 拿着旧 VNode 去新 children 中寻找相同的节点
    const has = nextChildren.find(
      nextVNode => nextVNode.key === prevVNode.key
    )
    if (!has) {
      // 如果没有找到相同的节点，则移除
      container.removeChild(prevVNode.el)
    }
  }
}