import { h } from './h'
import { render } from './render'

// 子组件 - 函数式组件
function MyFunctionalComp(props) {
  return h('div', null, props.text)
}
// 父组件类
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
