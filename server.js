const path = require('path')
const express = require('express')
const expressWs = require('express-ws')
const pty = require('node-pty')

const app = express()

expressWs(app)

app.use(express.static(path.resolve(__dirname, 'dist')))

app.get('/*', (req, res, next) => {
  console.log(req.url)
  console.log(req.headers)
  next()
})

app.ws('/tty', (ws, req) => {
  console.log(req.url)
  console.log(req.headers)

  let term;

  const INPUT = 0xfa;
  const RESIZE = 0xfb;
  const CONNECT = 0xfc;

  ws.on('message', (data) => {
    switch (data.charCodeAt(0)) {
      case INPUT:
        term.write(data.slice(1))
        break;
      case RESIZE:
        term.resize(data.charCodeAt(1), data.charCodeAt(2))
        break;
      case CONNECT:
        term = pty.spawn(process.env.SHELL, [], {
          name: 'xterm-256color',
          env: process.env,
        });
        term.onData((data) => {
          try {
            ws.send(data);
          } catch (e) {
            console.log(e)
          }
        });
        term.onExit(() => {
            ws.close()
        });
        break;
    }
  })

  ws.on('close', (code) => {
    term.kill()
    console.log('Websocket closed with: ', code)
  })
})

app.listen(3000, '0.0.0.0', () => {
  console.log('Example app listening on port 3000!')
})
