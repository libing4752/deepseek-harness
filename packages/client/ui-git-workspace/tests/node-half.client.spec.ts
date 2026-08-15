/**
 * Node-half smoke: the empty host `apply` is a no-op body (the browser half
 * ships via exports["./client"]), pinned so a future accidental host-side
 * behavior addition is a visible change.
 */
import { describe, expect, it } from 'vitest'
import { apply } from '../src/index.ts'

describe('node half', () => {
  it('apply is a no-op', () => {
    expect(apply()).toBeUndefined()
  })
})
