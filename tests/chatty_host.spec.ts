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

import { Chatty } from '../src/index'
import { ChattyClientMessages } from '../src/client_messages'
import { ChattyHostMessages } from '../src/host_messages'
import { ChattyHostConnection, ChattyHostStates } from '../src/host'
let eventName: string
let channel: MessageChannel
let payload: any
let host: any
let connecting: Promise<ChattyHostConnection>
let action: ChattyClientMessages
let data: any
let dance: any

const url = '/base/tests/test.html'

describe('ChattyHost', () => {
  beforeEach(() => {
    eventName = 'EVENT'
    payload = { status: 'lit' }
    data = {}
    channel = new MessageChannel()
  })

  afterEach(() => {
    if (host.iframe) {
      host.iframe.remove()
    }
  })

  describe('sendMsg', () => {
    it('should post message', () => {
      action = ChattyClientMessages.Message
      host = Chatty.createHost(url).build()
      expect(host._state).toEqual(ChattyHostStates.Connecting)
      host.connect()
      host._port = {
        postMessage: jasmine.createSpy()
      }
      host.sendMsg(action)
      expect(host._port.postMessage).toHaveBeenCalledWith({
        action: action,
        data: {}
      })
    })

    it('should post message with a payload', () => {
      action = ChattyClientMessages.Message
      host = Chatty.createHost(url).build()
      expect(host._state).toEqual(ChattyHostStates.Connecting)
      host.connect()
      host._port = {
        postMessage: jasmine.createSpy()
      }
      host.sendMsg(action, data)
      expect(host._port.postMessage).toHaveBeenCalledWith({
        action: action,
        data: data
      })
    })
  })

  describe('connect', () => {
    describe('message event listener', () => {
      beforeEach(() => {
        host = Chatty.createHost(url).build()
        spyOn(host, 'sendMsg')
      })

      it('should do nothing if message is not valid', () => {
        host.sendMsg.calls.reset()
        host._hostWindow.postMessage({
          action: ChattyClientMessages.Message,
          data: {
            data: {
              eventName: ''
            }
          }
        }, '*')
        expect(host.isConnected).toEqual(false)
        expect(host._state).toEqual(ChattyHostStates.Connecting)
        expect(host.sendMsg).not.toHaveBeenCalled()
      })

      describe('isValidMsg', () => {
        it('should be valid if source matches', () => {
          expect(host._targetOrigin).toEqual(null)
          const msg = {
            source: host.iframe.contentWindow,
            origin: 'http://example.com:9999'
          }
          expect(host.isValidMsg(msg)).toEqual(true)
        })

        it('should be valid if source matches and targetOrigin matches', () => {
          host._targetOrigin = 'http://example.com:9999'
          const msg = {
            source: host.iframe.contentWindow,
            origin: 'http://example.com:9999'
          }
          expect(host.isValidMsg(msg)).toEqual(true)
        })

        it('should be valid if source matches and targetOrigin is *', () => {
          host._targetOrigin = '*'
          const msg = {
            source: host.iframe.contentWindow,
            origin: 'http://example.com:9999'
          }
          expect(host.isValidMsg(msg)).toEqual(true)
        })

        it('should be invalid if the source doesn\'t match', () => {
          const msg = {
            source: window,
            origin: 'http://example.com:9999'
          }
          expect(host.isValidMsg(msg)).toEqual(false)
        })

        it('should be invalid if the origin doesn\'t match', () => {
          host._targetOrigin = 'http://danger.com:9999'
          const msg = {
            source: host.iframe.contentWindow,
            origin: 'http://example.com:9999'
          }
          expect(host.isValidMsg(msg)).toEqual(false)
        })
      })

      describe('host receives Syn', () => {
        beforeEach(() => {
          spyOn(host, 'isValidMsg').and.returnValue(true)
          connecting = host.connect()
          host._hostWindow.postMessage({
            action: ChattyClientMessages.Syn
          }, '*', [channel.port2])
          channel.port1.postMessage({
            action: ChattyClientMessages.Ack
          })
        })

        it('should send a SynAck message', (done) => {
          connecting.then(() => {
            expect(host.sendMsg).toHaveBeenCalledWith(ChattyHostMessages.SynAck)
            done()
          }).catch(console.error)
        })

        describe('host receives another Syn', () => {
          let channel2: MessageChannel

          beforeEach((done) => {
            channel2 = new MessageChannel()
            connecting.then(() => {
              expect(host.sendMsg).toHaveBeenCalledWith(ChattyHostMessages.SynAck)
              host.sendMsg.calls.reset()
              done()
            }).catch(console.error)
          })

          it('should reconnect if the targetOrigin is set to *', (done) => {
            host._targetOrigin = '*'
            host._hostWindow.postMessage({
              action: ChattyClientMessages.Syn
            }, '*', [channel2.port2])
            setTimeout(() => {
              expect(host.sendMsg).toHaveBeenCalledWith(ChattyHostMessages.SynAck)
              expect(host._port).toEqual(channel2.port2)
              done()
            })
          })

          it('should reconnect if the targetOrigin is set to the iframe origin', (done) => {
            host._targetOrigin = host._hostWindow.location.origin
            host._hostWindow.postMessage({
              action: ChattyClientMessages.Syn
            }, '*', [channel2.port2])
            setTimeout(() => {
              expect(host.sendMsg).toHaveBeenCalledWith(ChattyHostMessages.SynAck)
              expect(host._port).toEqual(channel2.port2)
              done()
            })
          })

          it('should ignore if the targetOrigin is not set', (done) => {
            host._targetOrigin = null
            host._hostWindow.postMessage({
              action: ChattyClientMessages.Syn
            }, '*', [channel2.port2])
            setTimeout(() => {
              expect(host.sendMsg).not.toHaveBeenCalled()
              expect(host._port).toEqual(channel.port2)
              done()
            })
          })

          it('should ignore if the targetOrigin does not match', (done) => {
            host._targetOrigin = 'https://example.com:9999'
            host._hostWindow.postMessage({
              action: ChattyClientMessages.Syn
            }, '*', [channel2.port2])
            setTimeout(() => {
              expect(host.sendMsg).not.toHaveBeenCalled()
              expect(host._port).toEqual(channel.port2)
              done()
            })
          })
        })
      })

      describe('host receives Ack', () => {
        beforeEach(() => {
          spyOn(host, 'isValidMsg').and.returnValue(true)
          connecting = host.connect()
          host._hostWindow.postMessage({
            action: ChattyClientMessages.Syn
          }, '*', [channel.port2])
          channel.port1.postMessage({
            action: ChattyClientMessages.Ack,
            data: data
          })
        })

        it('should resolve with a connection whose send function sends a message to the client', (done) => {
          connecting.then((connection) => {
            connection.send(eventName, payload)
            expect(host.sendMsg).toHaveBeenCalledWith(ChattyHostMessages.Message, { eventName, payload: [payload] })
            expect(host._state).toEqual(ChattyHostStates.Connected)
            expect(host.isConnected).toEqual(true)
            done()
          }).catch(console.error)
        })
      })

      describe('host receives Message', () => {
        beforeEach(() => {
          dance = jasmine.createSpy('dance')
          host = Chatty.createHost(url)
            .on('party', dance)
            .build()

          spyOn(host, 'isValidMsg').and.returnValue(true)
          spyOn(host, 'sendMsg')

          connecting = host.connect()
        })

        it('should apply the correct event handler', (done) => {
          host._hostWindow.postMessage({
            action: ChattyClientMessages.Syn
          }, '*', [channel.port2])
          channel.port1.postMessage({
            action: ChattyClientMessages.Ack
          })

          connecting.then(() => {
            channel.port1.postMessage({
              action: ChattyClientMessages.Message,
              data: {
                eventName: 'party',
                payload: payload
              }
            })
            setTimeout(() => {
              expect(dance).toHaveBeenCalled()
              done()
            })
          }).catch(console.error)
        })

        it('should ignore unknown events', (done) => {
          host._hostWindow.postMessage({
            action: ChattyClientMessages.Syn
          }, '*', [channel.port2])
          channel.port1.postMessage({
            action: ChattyClientMessages.Ack
          })

          connecting.then(() => {
            channel.port1.postMessage({
              action: ChattyClientMessages.Message,
              data: {
                eventName: 'study'
              }
            })
            setTimeout(() => {
              expect(dance).not.toHaveBeenCalled()
              done()
            })
          }).catch(console.error)
        })
      })

      it('should only connect once', () => {
        host = Chatty.createHost(url).build()

        spyOn(host._appendTo, 'appendChild')

        connecting = host.connect()
        expect(host.connection).not.toBe(null)
        expect(host._appendTo.appendChild.calls.count()).toEqual(1)
        connecting = host.connect()
        expect(host._appendTo.appendChild.calls.count()).toEqual(1)
        expect()
      })
    })

    it('should append child iframe', () => {
      host = Chatty.createHost(url)
        .build()
      expect(host._appendTo).toEqual(document.body)
      spyOn(host._appendTo, 'appendChild')
      spyOn(host, 'isValidMsg').and.returnValue(true)
      connecting = host.connect()
      expect(host._appendTo.appendChild).toHaveBeenCalledWith(host.iframe)
    })

    it('should append child iframe to selected element', () => {
      const div = document.createElement('div')
      document.body.appendChild(div)
      host = Chatty.createHost(url)
        .appendTo(div)
        .build()
      expect(host._appendTo).toEqual(div)
      spyOn(host._appendTo, 'appendChild')
      spyOn(host, 'isValidMsg').and.returnValue(true)
      connecting = host.connect()
      expect(host._appendTo.appendChild).toHaveBeenCalledWith(host.iframe)
      document.body.removeChild(div)
    })

    it('should apply appropriate sandbox values', () => {
      host = Chatty.createHost(url)
        .sandbox('allow-scripts')
        .build()
      expect(host.iframe.sandbox.toString()).toEqual('allow-scripts')
    })
  })
})
