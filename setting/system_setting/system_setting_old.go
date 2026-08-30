package system_setting

var ServerAddress = "http://localhost:3000"
var TaskPublicAddress = ""
var WorkerUrl = ""
var WorkerValidKey = ""
var WorkerAllowHttpImageRequestEnabled = false
var VideoWorkerUrl = ""
var VideoWorkerSecret = ""

func EnableWorker() bool {
	return WorkerUrl != ""
}

func EnableVideoWorker() bool {
	return VideoWorkerUrl != "" && len(VideoWorkerSecret) >= 32
}
