export function eventsForFrame(frame, events) {
  const eventsById = new Map((events ?? []).map(event => [event.id, event]))
  return (frame?.eventIds ?? [])
    .map(id => eventsById.get(id))
    .filter(Boolean)
}

export function eventsUpToTick(events, tick) {
  const currentTick = Math.floor(Number(tick) || 0)
  return (events ?? []).filter(event => Number(event.tick) <= currentTick)
}

export function latestEventMessages(events, tick, limit = 4) {
  return eventsUpToTick(events, tick)
    .slice(-limit)
    .map(event => event.commentaryText ?? event.message)
}
