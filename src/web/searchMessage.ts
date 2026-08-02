export interface SearchExplanation {
  reason: 'no-availability' | 'not-monitored'
  monitoredBy: string[]
}

export function explanationMessage(e: SearchExplanation): string {
  if (e.reason === 'no-availability') {
    return 'This route is monitored, but nothing is currently available.'
  }
  if (e.monitoredBy.length === 0) {
    return 'No program you have configured monitors this route.'
  }
  return `No program you have configured flies this route, but ${e.monitoredBy.join(', ')} reach this destination from another origin — positioning there would unlock it.`
}
