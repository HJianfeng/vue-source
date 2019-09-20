# vue3 渲染器详解（二）

[vue3 渲染器详解（一）](https://github.com/HJianfeng/vue-source)  
[vue3 渲染器详解（二）](https://github.com/HJianfeng/vue-source/blob/master/README1.md)  
[vue3 渲染器详解（三）](https://github.com/HJianfeng/vue-source/blob/master/README2.md)  

## 一、减少dom操作
上一偏我们知道了渲染器是如何更新各种`VNode`类型，我回顾一下，在`patch`中我们什么时候才需要使用`diff`算法呢。

![](https://user-gold-cdn.xitu.io/2019/9/20/16d4c78834c38dda?w=1688&h=490&f=png&s=110425)

只有当新旧`childrn`都有多个子节点时，我们才需要运行`diff`算法，`diff`算法的目的是为了减少dom操作的性能消耗，通过一些列对比使用最优的方法去更新子节点。  
我们在上一偏的时候使用了一个比较暴力的`diff`算法，直接移除旧节点，在把全部的新节点挂载上去。
```javascript
// 更新子节点
function patchChildren(
  prevChildFlags,
  nextChildFlags,
  prevChildren,
  nextChildren,
  container
) {
    switch (prevChildFlags) {
        // 省略...

    // 旧的 children 中有多个子节点
    default:
      switch (nextChildFlags) {
        case ChildrenFlags.SINGLE_VNODE:
          // 省略...
        case ChildrenFlags.NO_CHILDREN:
          // 省略...
        default:
          // 新的 children 中有多个子节点
          // 遍历旧的子节点，将其全部移除
          for (let i = 0; i < prevChildren.length; i++) {
            container.removeChild(prevChildren[i].el)
          }
          // 遍历新的子节点，将其全部添加
          for (let i = 0; i < nextChildren.length; i++) {
            mount(nextChildren[i], container)
          }
          break
      }
      break
    }
}
```
假设我们现在有一个列表
```html
<ul>
  <li>1</li>
  <li>2</li>
  <li>3</li>
</ul>
```
他的子元素的VNode为
```javascript
[
  h('li', null, 1),
  h('li', null, 2),
  h('li', null, 3)
]
```
现在通过改变数据来变化子元素
```javascript
[
  h('li', null, 3),
  h('li', null, 1),
  h('li', null, 2)
]
```
我们可以知道新旧节点的标签都是一样的，所以我们在diff算法中直接使用`patch`就可以了。
```javascript
function diff (
  prevChildren,
  nextChildren,
  container
) {
    for (let i = 0; i < prevChildren.length; i++) {
        patch(prevChildren[i], nextChildren[i], container)
    }
}
```
操作图为：

![](https://user-gold-cdn.xitu.io/2019/9/20/16d4c97e02d09000?w=224&h=390&f=png&s=189748)

还有一种情况是新旧节点的个数不一样
```javascript
const prevVNode = h('div', null, [
  h('p', null, '旧的子节点1'),
  h('p', null, '旧的子节点2'),
  h('p', null, '旧的子节点3')
])

// 新的 VNode
const nextVNode = h('div', null, [
  h('p', null, '新的子节点1'),
  h('p', null, '新的子节点2'),
  h('p', null, '新的子节点3'),
  h('p', null, '新的子节点4')
])
```
所以我们需要遍历的不一定是旧的子节点长度，我们需要遍历的是新旧节点长度比较短的那一个
```javascript
function diff (
  prevChildren,
  nextChildren,
  container
) {
    // 获取公共长度，取新旧 children 长度较小的那一个
    const prevLen = prevChildren.length
    const nextLen = nextChildren.length
    const commonLength = prevLen > nextLen ? nextLen : prevLen
    
    for (let i = 0; i < commonLength.length; i++) {
        patch(prevChildren[i], nextChildren[i], container)
    }
    // 如果新children比较长则挂载多余的元素
    // 如果旧children比较长则移除多余的元素
    if(prevLen > nextLen) {
        for (let i = commonLength; i < prevLen; i++) {
          container.removeChild(prevChildren[i].el)
        }
    } else if (prevLen < nextLen) {
        for (let i = commonLength; i < prevLen; i++) {
          mount(nextChildren[i], container)
        }
    }
}
```

## 二、复用DOM元素
在上一小节中我们通过减少 DOM 操作的次数使得更新的性能得到了提升，但是还是有优化的空间，比如：
```javascript
const prevVNode = h('ul', null, [
  h('li', null, '1'),
  h('li', null, '2'),
  h('li', null, '3')
])

// 新的 VNode
const nextVNode = h('ul', null, [
  h('li', null, '2'),
  h('li', null, '3'),
  h('li', null, '1')
])
```
我们可以看出他们只是顺序不一样而已，如果按照上小节代码我们会一个个去`patch`它们，但是最好的办法是通过移动节点的办法去复用dom节点。  

#### key的作用
但是我们如何才能找到他们所对应的关系呢？我们需要通过新增以一个属性`key`建立一个映射关系，所以这就是为什么我们在写列表的时候是必须要传`key`值，如果没传在`h`函数中也会自动加上。  
为了 `diff` 算法更加方便的读取一个 `VNode` 的 `key`，我们应该在创建 `VNode` 时将 `VNodeData` 中的 `key` 添加到 `VNode` 本身，所以我们需要修改一下 h 函数，如下：
```javascript
export function h(tag, data = null, children = null) {
  // 省略...

  // 返回 VNode 对象
  return {
    _isVNode: true,
    flags,
    tag,
    data,
    key: data && data.key ? data.key : null,
    children,
    childFlags,
    el: null
  }
}
```
现在，在创建 VNode 时已经可以为 VNode 添加唯一标识了，我们使用 key 来修改之前的例子，如下：
```javascript
// 旧 children
[
  h('li', { key: 'a' }, 1),
  h('li', { key: 'b' }, 2),
  h('li', { key: 'c' }, 3)
]

// 新 children
[
  h('li', { key: 'c' }, 3)
  h('li', { key: 'a' }, 1),
  h('li', { key: 'b' }, 2)
]
```
这样我们就知道他们的映射关系，知道他们的关系后我们就可以判断新 children 中的节点是否可被复用
```javascript
// 遍历新的 children
for (let i = 0; i < nextChildren.length; i++) {
  const nextVNode = nextChildren[i]
  let j = 0
  // 遍历旧的 children
  for (j; j < prevChildren.length; j++) {
    const prevVNode = prevChildren[j]
    // 如果找到了具有相同 key 值的两个节点，则调用 `patch` 函数更新之
    if (nextVNode.key === prevVNode.key) {
      patch(prevVNode, nextVNode, container)
      
      // 更新完成后，这里进行移动元素操作
      
      break  // 这里需要 break
    }
  }
}
```
这段代码中有两层嵌套的 for 循环语句，外层循环用于遍历新 children，内层循环用于遍历旧 children，其目的是尝试寻找具有相同 key 值的两个节点，如果找到了，则认为新 children 中的节点可以复用旧 children 中已存在的节点，这时我们仍然需要调用 patch 函数对节点进行更新，如果新节点相对于旧节点的 VNodeData 和子节点都没有变化，则 patch 函数什么都不会做(这是优化的关键所在)，如果新节点相对于旧节点的 VNodeData 或子节点有变化，则 patch 函数保证了更新的正确性。  

#### 找到需要移动的节点

现在我们已经找到了可复用的节点，并进行了合适的更新操作，下一步需要做的，就是判断一个节点是否需要移动以及如何移动。如何判断节点是否可以移动呢？这里可能比较绕，我们先来看看如果当新旧 children 中的节点顺序不变时，就不需要额外的移动操作。


![](https://user-gold-cdn.xitu.io/2019/9/20/16d4d3ef628a8e92?w=868&h=552&f=png&s=179801)  
1. 取出新children的第一个节点`li-a`，尝试在旧children中找`li-a`，结果找到了，对应在旧children的索引是`0`
2. 取出新children的第二个节点`li-b`，尝试在旧children中找`li-a`，结果找到了，对应在旧children的索引是`1`
3. 取出新children的第三个节点`li-c`，尝试在旧children中找`li-a`，结果找到了，对应在旧children的索引是`2`

我们可以看得出如果在新旧children顺序不变的情况下，其索引是按照 `0`->`1`->`2` 趋势递增。所以我们如果在遍历查找旧children中所找到的索引不是按照递增趋势传递的，那就说明打破趋势的那个子节点位置不对需要移动。如下：

![](https://user-gold-cdn.xitu.io/2019/9/20/16d4d498d821ca70?w=994&h=572&f=png&s=185393)  
1. 取出新children第一个节点`li-c`，查找旧children，结果找到了，索引是`2`
2. 取出新children第二个节点`li-a`，查找旧children，结果找到了，索引是`0`

趋势被打破了，说明`li-a`是需要移动的节点，继续执行：  

3. 取出新children第三个节点`li-b`，查找旧children，结果找到了，索引是`1`  

我们发现 1 同样小于 2，这说明在旧 children 中节点 li-b 的位置也要比 li-c 的位置靠前，但在新的 children 中 li-b 的位置要比 li-c 靠后。所以 li-b 也需要被移动。  

我们可以设置一个`lastIndex`变量来储存遇到的最大索引
```javascript
// 用来存储寻找过程中遇到的最大索引值
let lastIndex = 0
// 遍历新的 children
for (let i = 0; i < nextChildren.length; i++) {
  const nextVNode = nextChildren[i]
  let j = 0
  // 遍历旧的 children
  for (j; j < prevChildren.length; j++) {
    const prevVNode = prevChildren[j]
    // 如果找到了具有相同 key 值的两个节点，则调用 `patch` 函数更新之
    if (nextVNode.key === prevVNode.key) {
      patch(prevVNode, nextVNode, container)
      if (j < lastIndex) {
        // 需要移动
      } else {
        // 不需要移动，更新 lastIndex
        lastIndex = j
      }
      break // 这里需要 break
    }
  }
}
```
这样我们就找到了需要被移动的节点。

#### 移动节点
那如何移动节点呢，我们把通过`patch`完后的真实dom插入到前一个元素的后面，比如上面那个例子：

![](https://user-gold-cdn.xitu.io/2019/9/20/16d4d5ce842a6702?w=1192&h=748&f=png&s=292046)

```javascript
function diff (
  prevChildren,
  nextChildren,
  container
 ) {
    // 用来存储寻找过程中遇到的最大索引值
    let lastIndex = 0
    // 遍历新的 children
    for (let i = 0; i < nextChildren.length; i++) {
      const nextVNode = nextChildren[i]
      let j = 0
      // 遍历旧的 children
      for (j; j < prevChildren.length; j++) {
        const prevVNode = prevChildren[j]
        // 如果找到了具有相同 key 值的两个节点，则调用 `patch` 函数更新之
        if (nextVNode.key === prevVNode.key) {
          patch(prevVNode, nextVNode, container)
          if (j < lastIndex) {
            // 需要移动
            // refNode 是为了下面调用 insertBefore 函数准备的
            const refNode = nextChildren[i - 1].el.nextSibling
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
    }
}
```
#### 添加新元素
我们一直忽略一种情况，当新children里面有旧children没有的元素怎么办，上面的操作是取到相同的元素进行跟新和移动，如果是从未出现的新元素，我们就需要取挂载它。
```javascript
let lastIndex = 0
for (let i = 0; i < nextChildren.length; i++) {
  const nextVNode = nextChildren[i]
  // 增加变量find
  let j = 0,
    find = false
  for (j; j < prevChildren.length; j++) {
    const prevVNode = prevChildren[j]
    if (nextVNode.key === prevVNode.key) {
      find = true
      patch(prevVNode, nextVNode, container)
      if (j < lastIndex) {
        // 需要移动
        const refNode = nextChildren[i - 1].el.nextSibling
        container.insertBefore(prevVNode.el, refNode)
        break
      } else {
        // 更新 lastIndex
        lastIndex = j
      }
    }
  }
  // 如果遍历完旧的children，find还是false，说明没有找到
  if (!find) {
    // 挂载新节点
    mount(nextVNode, container, false)
  }
}
```
我们增加了一个变量`find`，如果内层结束后`find`还是false，说明这个节点在旧children找不到可以复用的。  
但是这样写是有缺陷的，因为我们之前编写的 mountElement 函数存在缺陷，它总是调用 appendChild 方法插入 DOM 元素，所以上面的代码始终会把新的节点作为容器元素的最后一个子节点添加到末尾，这不是我们想要的结果，我们应该按照节点在新的 children 中的位置将其添加到正确的地方，如下图所示：

![](https://user-gold-cdn.xitu.io/2019/9/20/16d4d896265b3be1?w=994&h=374&f=png&s=40989)

新的 li-d 节点紧跟在 li-a 节点的后面，所以正确的做法应该是把 li-d 节点添加到 li-a 节点所对应真实 DOM 的后面才行。如何才能保证 li-d 节点始终被添加到 li-a 节点的后面呢？答案是使用 insertBefore 方法代替 appendChild 方法，我们可以找到 li-a 节点所对应真实 DOM 的下一个节点，然后将 li-d 节点插入到该节点之前即可，如下代码所示：
```javascript
let lastIndex = 0
for (let i = 0; i < nextChildren.length; i++) {
  const nextVNode = nextChildren[i]
  // 增加变量find
  let j = 0,
    find = false
  for (j; j < prevChildren.length; j++) {
    const prevVNode = prevChildren[j]
    if (nextVNode.key === prevVNode.key) {
      find = true
      patch(prevVNode, nextVNode, container)
      if (j < lastIndex) {
        // 需要移动
        const refNode = nextChildren[i - 1].el.nextSibling
        container.insertBefore(prevVNode.el, refNode)
        break
      } else {
        // 更新 lastIndex
        lastIndex = j
      }
    }
  }
  if (!find) {
    // 挂载新节点
    // 找到 refNode
    const refNode =
      i - 1 < 0
        ? prevChildren[0].el
        : nextChildren[i - 1].el.nextSibling
    mount(nextVNode, container, false, refNode)
  }
}
```
我们先找到当前遍历到的节点的前一个节点，即 `nextChildren[i - 1]`，接着找到该节点所对应真实 DOM 的下一个子节点作为 refNode，即 `nextChildren[i - 1].el.nextSibling`，但是由于当前遍历德维尔节点可能是第一个节点所以进行`i-1 < 0` 的判断。这样如果它是第一个节点，我们只需要把它插入到第一个节点就可以了，然后我们把`refNode`传给`mount`，接下来我们要改一下之前`mount`和`mountElement`的代码
```javascript
// mount 函数
// 增加参数 refNode
function mount(vnode, container, isSVG, refNode) {
  const { flags } = vnode
  if (flags & VNodeFlags.ELEMENT) {
    // 挂载普通标签
    mountElement(vnode, container, isSVG, refNode)
  }

  // 省略...
}

// mountElement 函数
function mountElement(vnode, container, isSVG, refNode) {
  // 省略...
  // 如果有refNode则使用 insertBefore 没有则使用 appendChild
  refNode ? container.insertBefore(el, refNode) : container.appendChild(el)
}
```

#### 移除不存在的元素
还存在最后一种情况，当新的children里不存在旧children的元素时，说明我们需要把它移除了。这个逻辑比较简单，直接看代码
```javascript
// 移除已经不存在的节点
// 遍历旧的节点
function diff (
  prevChildren,
  nextChildren,
  container
) {
    let lastIndex = 0
    for (let i = 0; i < nextChildren.length; i++) {
      const nextVNode = nextChildren[i]
      let j = 0,
        find = false
      for (j; j < prevChildren.length; j++) {
        // 省略...
      }
      if (!find) {
        // 挂载新节点
        // 省略...
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
```

## 小结
其实react里采用的diff算法思想也是这样的。至此我们用三篇的篇幅讲解了整个渲染器的原理，在代码结构上还存在很多优化的空间，这些就看大家按自己习惯的编码方式去优化了。