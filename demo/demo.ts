/*
 * The MIT License (MIT)
 *
 * Copyright (c) 2019 Looker Data Sciences, Inc.
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in
 * all copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
 * THE SOFTWARE.
 */

import { Chatty, ChattyHostConnection } from '../src/index'
import { Actions } from './constants'
import { Msg } from './types'

const doGetTitle = (client: ChattyHostConnection, id: number) => {
  client.sendAndReceive(Actions.GET_TITLE).then((payload: any[]) => {
    document.querySelector(`#got-title-${id}`)!.innerHTML = payload[0]
  }).catch(console.error)
}

document.addEventListener('DOMContentLoaded', () => {
  Chatty.createHost('//localhost:8080/client.html')
    .appendTo(document.querySelector('#div-1') as HTMLElement)
    .on(Actions.SET_STATUS, (msg: Msg) => {
      const status: Element = document.querySelector('#host-status')!
      status.innerHTML = `${msg.status} 1`
    })
    .frameBorder('1')
    .withTargetOrigin(window.location.origin)
    .build()
    .connect()
    .then(client => {
      document.querySelector('#change-status')!.addEventListener('click', () => {
        client.send(Actions.SET_STATUS, { status: 'Message to client 1' })
      })
      document.querySelector('#get-title-1')!.addEventListener('click', () => doGetTitle(client, 1))
    })
    .catch(console.error)
  Chatty.createHost('//localhost:8080/client.html')
    .appendTo(document.querySelector('#div-2') as HTMLElement)
    .on(Actions.SET_STATUS, (msg: Msg) => {
      const status = document.querySelector('#host-status')!
      status.innerHTML = `${msg.status} 2`
    })
    .frameBorder('1')
    .withTargetOrigin(window.location.origin)
    .build()
    .connect()
    .then(client => {
      document.querySelector('#change-status')!.addEventListener('click', () => {
        client.send(Actions.SET_STATUS, { status: 'Message to client 2' })
      })
      document.querySelector('#get-title-2')!.addEventListener('click', () => doGetTitle(client, 2))
    })
    .catch(console.error)
})
