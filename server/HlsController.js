const express = require('express')
const Path = require('path')
const fs = require('fs-extra')
const Logger = require('./Logger')

class HlsController {
  constructor(db, scanner, auth, streamManager, emitter, MetadataPath) {
    this.db = db
    this.scanner = scanner
    this.auth = auth
    this.streamManager = streamManager
    this.emitter = emitter
    this.MetadataPath = MetadataPath

    this.router = express()
    this.init()
  }

  init() {
    this.router.get('/:stream/:file', this.streamFileRequest.bind(this))
  }

  parseSegmentFilename(filename) {
    var basename = Path.basename(filename, '.ts')
    var num_part = basename.split('-')[1]
    return Number(num_part)
  }

  async streamFileRequest(req, res) {
    var streamId = req.params.stream
    var fullFilePath = Path.join(this.MetadataPath, streamId, req.params.file)

    // development test stream - ignore
    if (streamId === 'test') {
      Logger.debug('Test Stream Request', streamId, req.headers, fullFilePath)
      return res.sendFile(fullFilePath)
    }

    var exists = await fs.pathExists(fullFilePath)
    if (!exists) {
      Logger.warn('File path does not exist', fullFilePath)

      var fileExt = Path.extname(req.params.file)
      if (fileExt === '.ts') {
        var segNum = this.parseSegmentFilename(req.params.file)
        var stream = this.streamManager.getStream(streamId)
        if (!stream) {
          Logger.error(`[HLS-CONTROLLER] Stream ${streamId} does not exist`)
          return res.sendStatus(500)
        }

        if (stream.isResetting) {
          Logger.info(`[HLS-CONTROLLER] Stream ${streamId} is currently resetting`)
          return res.sendStatus(404)
        } else {
          var startTimeForReset = await stream.checkSegmentNumberRequest(segNum)
          if (startTimeForReset) {
            // HLS.js will restart the stream at the new time
            Logger.info(`[HLS-CONTROLLER] Resetting Stream - notify client @${startTimeForReset}s`)
            this.emitter('stream_reset', {
              startTime: startTimeForReset,
              streamId: stream.id
            })
            return res.sendStatus(500)
          }
        }
      }
    }
    // Logger.info('Sending file', fullFilePath)
    res.sendFile(fullFilePath)
  }
}
module.exports = HlsController