import { dbToMeterPosition, type AudioLevel } from '@echovault/audio-engine';

interface Props {
  label: string;
  level?: AudioLevel;
}

/** A horizontal audio level meter with peak + clip indication. */
export function LevelMeter({ label, level }: Props) {
  const rms = level ? dbToMeterPosition(level.rmsDb) : 0;
  const peak = level ? dbToMeterPosition(level.peakDb) : 0;
  const clipping = level?.clipping ?? false;

  return (
    <div className="meter">
      <div className="meter__label">
        <span>{label}</span>
        <span className="meter__db">
          {level && isFinite(level.rmsDb) ? `${level.rmsDb.toFixed(0)} dB` : '—'}
        </span>
      </div>
      <div className="meter__track">
        <div
          className={`meter__fill ${clipping ? 'meter__fill--clip' : ''}`}
          style={{ width: `${Math.round(rms * 100)}%` }}
        />
        <div className="meter__peak" style={{ left: `${Math.round(peak * 100)}%` }} />
      </div>
    </div>
  );
}
