const DEFAULT_INSTRUCTIONS = [
  {
    step: "1",
    title: "Wait for the question",
    detail: "Read the question on the main screen before trying to buzz.",
  },
  {
    step: "2",
    title: "Buzz fast",
    detail: "When the host opens the buzzer, the first team to press gets the first chance.",
  },
  {
    step: "3",
    title: "Answer clearly",
    detail: "After time is up, the host checks answers in buzzer order and confirms the winner.",
  },
  {
    step: "4",
    title: "Watch the scoreboard",
    detail: "Scores and standings update live on the front screen after each round.",
  },
];

export default function PlayInstructions({
  title = "How To Play",
  subtitle = "Quick instructions for players before the round begins.",
  items = DEFAULT_INSTRUCTIONS,
  compact = false,
}) {
  return (
    <section className={`play-instructions ${compact ? "compact" : ""}`}>
      <div className="play-instructions-header">
        <div className="play-instructions-eyebrow">Playing Instructions</div>
        <h2 className="play-instructions-title">{title}</h2>
        <p className="play-instructions-subtitle">{subtitle}</p>
      </div>

      <div className="play-instructions-grid">
        {items.map((item) => (
          <article key={item.step} className="play-instruction-card">
            <div className="play-instruction-step">{item.step}</div>
            <div className="play-instruction-copy">
              <div className="play-instruction-name">{item.title}</div>
              <p className="play-instruction-detail">{item.detail}</p>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
