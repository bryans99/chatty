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

import { CallbackStore } from './types'
import { ChattyHostBuilder } from './host_builder'
import { ChattyClientMessages } from './client_messages'
import { ChattyHostMessages } from './host_messages'
import 'es6-promise/auto' // Polyfill only browsers without Promises
import * as debugLib from 'debug'

/**
 * @private
 * Host connection status
 */

export enum ChattyHostStates {
  Connecting,
  SynAck,
  Connected
}

/**
 * The Host connection to the client.
 */

export type ChattyHostConnection = {
  /**
   * @param eventName The name of the event to send to the client
   * @param payload Additional data to send to the client. Restricted to transferable objects, ownership of the
   * object will be transferred to the client.
   */

  send (eventName: string, ...payload: any[]): void
}

/**
 * The host object for an iframe. The user should not create this object directly, it
 * is returned by the `ChattyClientBuilder.build()` method.
 */

export class ChattyHost {
  private static _debug = debugLib('looker:chatty:host')

  /**
   * The underlying iframe element
   */
  public iframe: HTMLIFrameElement

  private _hostWindow = window
  private _appendTo: HTMLElement
  private _connection: Promise<ChattyHostConnection> | null = null
  private _port: MessagePort | null
  private _handlers: CallbackStore
  private _targetOrigin: string | null
  private _state = ChattyHostStates.Connecting

  /**
   * @param builder The client builder that is responsible for constructing this object.
   * @hidden
   */

  constructor (builder: ChattyHostBuilder) {
    this.iframe = document.createElement('iframe')
    builder.sandboxAttrs.forEach(attr => this.iframe.sandbox.add(attr))
    // tslint:disable-next-line:deprecation
    this.iframe.frameBorder = builder.getFrameBorder()
    this.iframe.src = builder.url
    this._appendTo = builder.el
    this._handlers = builder.handlers
    this._port = null
    this._targetOrigin = builder.targetOrigin
  }

  /**
   * @returns a Promise to an object that resolves when the client initiates the connection.
   */

  get connection () {
    return this._connection
  }

  /**
   * @returns a flag indicating whether the client successfully connected to the host.
   */

  get isConnected () {
    return this._state === ChattyHostStates.Connected
  }

  /**
   * Connects to the client iframe. Waits for the client iframe to load and initiate a
   * connection using the chatty client.
   *
   * @returns a Promise to an object that resolves when the client has initiated the connection. The
   * object contains a `send(message, data)` method that can be used to talk to the host.
   */

  async connect (): Promise<ChattyHostConnection> {
    if (this._connection) return this._connection

    const createConnection = async () => {
      return new Promise<ChattyHostConnection>((resolve, reject) => {
        const eventListener = (evt: MessageEvent) => {
          ChattyHost._debug('port received', evt.data.action, evt.data.data)

          switch (evt.data.action) {
            case ChattyClientMessages.Ack:
              this._state = ChattyHostStates.Connected
              resolve({
                send: (eventName: string, ...payload: any[]) => {
                  this.sendMsg(ChattyHostMessages.Message, { eventName, payload })
                }
              })
              break
            case ChattyClientMessages.Message:
              if (this._handlers[evt.data.data.eventName]) {
                this._handlers[evt.data.data.eventName].forEach(fn => fn.apply(this, evt.data.data.payload))
              }
              break
          }
        }

        const windowListener = (evt: MessageEvent) => {
          if (!this.isValidMsg(evt)) {
            // don't reject here, since that breaks the promise resolution chain
            ChattyHost._debug('window received invalid', evt)
            return
          }
          ChattyHost._debug('window received', evt.data.action, evt.data.data)
          switch (evt.data.action) {
            case ChattyClientMessages.Syn:
              if (this._port) {
                // If targetOrigin is set and we receive another Syn, the frame has potentially
                // navigated to another valid webpage and we should re-connect
                if (this._targetOrigin && this._targetOrigin === '*' || this._targetOrigin === evt.origin) {
                  ChattyHost._debug('reconnecting to', evt.origin)
                  this._port.close()
                } else {
                  ChattyHost._debug('rejected new connection from', evt.origin)
                  return
                }
              }
              this._port = evt.ports[0]
              this._port.onmessage = eventListener
              this.sendMsg(ChattyHostMessages.SynAck)
              this._state = ChattyHostStates.SynAck
              break
          }
        }

        this._hostWindow.addEventListener('message', windowListener)
      })
    }

    this._appendTo.appendChild(this.iframe)
    return this._connection = createConnection()
  }

  private sendMsg (action: ChattyHostMessages, data: object = {}) {
    ChattyHost._debug('port sending', action, data)

    this._port!.postMessage({
      action: action,
      data: data
    })
  }

  // TODO: natenate
  // Frustratingly, enabling `allow-scripts` on a sandboxed iframe sets its origin to `'null'`
  // (that is, a string literal with a value of null). This means that in order to `postMessage`
  // to the client we must use `'*'` as the origin parameter.  To ensure messages received from
  // the client are who they claim to be, we check the origin is `'null'` and the contentWindow
  // is the one we have access to from the parent frame.  This method is described here:
  // https://www.html5rocks.com/en/tutorials/security/sandboxed-iframes/#safely-sandboxing-eval
  // If sandboxing is not enabled targetOrigin can be set and validated
  private isValidMsg (evt: MessageEvent) {
    if (evt.source !== this.iframe.contentWindow) return false
    if (this._targetOrigin && !(this._targetOrigin === '*' || this._targetOrigin === evt.origin)) return false
    return true
  }
}
