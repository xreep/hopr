import Icon from './icons'

// Demo hubs, listed the way a highway direction sign lists destinations. Each arrow
// points the way the city lies from the centre of India.
const DESTINATIONS = [
  { city: 'New Delhi', hub: 'Okhla', angle: -90 },
  { city: 'Kolkata', hub: 'Kasba', angle: 0 },
  { city: 'Ranchi', hub: 'Kokar', angle: -45 },
  { city: 'Mumbai', hub: 'MIDC Andheri', angle: 180 },
  { city: 'Bengaluru', hub: 'Bommanahalli', angle: 90 }
]

export default function DirectionSign({ title, lede, note = 'Demo hubs', as: Title = 'h2', className = '' }) {
  return (
    <div className={`sign-board ${className}`}>
      <Title className="sign-title">{title}</Title>
      {lede && <p className="sign-lede">{lede}</p>}
      <ul className="sign-destinations" aria-label="Demo hubs">
        {DESTINATIONS.map(d => (
          <li key={d.city}>
            <span className="sign-arrow" style={{ transform: `rotate(${d.angle}deg)` }} aria-hidden="true"><Icon name="arrowRight" size={20} strokeWidth={2.5} /></span>
            <span className="sign-city">{d.city}</span>
            <span className="sign-hub">{d.hub}</span>
          </li>
        ))}
      </ul>
      {note && <p className="sign-note">{note}</p>}
    </div>
  )
}
