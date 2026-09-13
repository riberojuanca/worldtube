import type { Subscription } from '../shared/ipc'
import { addActiveSubscription, listActiveSubscriptions, removeActiveSubscription } from './localDb'

export async function listSubscriptions(): Promise<Subscription[]> {
  return listActiveSubscriptions()
}

export async function addSubscription(sub: Omit<Subscription, 'subscribedAt'>): Promise<void> {
  return addActiveSubscription(sub)
}

export async function removeSubscription(channelId: string): Promise<void> {
  return removeActiveSubscription(channelId)
}
