import { usePlayer } from '../state/PlayerContext'
import { title } from '../lib/utils'
import logoIcon from '../assets/logo-icon.png'

export default function TitleBar() {
  const { current } = usePlayer()
  return (
    <header className="titlebar">
      <div className="tb-brand">
        <img src={logoIcon} alt="" draggable="false" />
        <span>Oplay</span>
      </div>
      <div className="tb-title">{current ? title(current) : ''}</div>
    </header>
  )
}
