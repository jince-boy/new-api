# Configurable upstream protocols

Advanced Custom channels are intended for providers whose URL, authentication,
request fields, response fields, or asynchronous task lifecycle do not follow a
standard SDK. A provider is described with channel configuration; adding the
next provider does not require a new Go adaptor.

Each route selects requests by public path and client model rule. It can then
configure:

- a relative or absolute upstream URL;
- an upstream HTTP method that may differ from the public endpoint method;
- header, query, no-auth, or default bearer authentication;
- custom headers with `{api_key}`, `{model}`, and `{task_id}` placeholders;
- synchronous JSON request and response templates for non-streaming text,
  image, and audio APIs;
- an asynchronous submit/poll/status/result protocol for video and other task
  APIs;
- separate authentication and headers for downloading the completed media.

## Asynchronous video example

The following uses the request contract currently shown by the Dimensio quick
start: channel base URL `https://jimeng.dimensio.cn`, submit endpoint
`POST /v1/videos/generations`, poll endpoint
`GET /v1/videos/tasks/:taskId`, and request fields `model`, `prompt`, `ratio`,
`resolution`, `duration`, `functionMode`, and `file_paths`. The quick-start page
does not publish the response bodies, so the response paths and provider status
names below remain examples and must be changed to match an actual response.

```json
{
  "advanced_routes": [
    {
      "incoming_path": "/v1/videos",
      "upstream_path": "/v1/videos/generations",
      "converter": "none",
      "models": ["seedance-2.0"],
      "auth": {
        "type": "header",
        "name": "Authorization",
        "value": "Bearer {api_key}"
      },
      "task": {
        "submit_method": "POST",
        "request_mode": "template",
        "body_template": {
          "model": "{model}",
          "prompt": "{request.prompt}",
          "ratio": "{request.ratio}",
          "resolution": "{request.resolution}",
          "duration": "{request.duration}",
          "functionMode": "{request.functionMode}",
          "file_paths": "{request.file_paths}"
        },
        "submit_response": {
          "task_id_path": "data.task_id",
          "status_path": "data.status"
        },
        "poll": {
          "method": "GET",
          "upstream_path": "/v1/videos/tasks/{task_id}",
          "response": {
            "status_path": "data.status",
            "progress_path": "data.progress",
            "result_url_path": "data.video_url",
            "error_path": "data.error.message",
            "status_map": {
              "pending": "QUEUED",
              "processing": "IN_PROGRESS",
              "completed": "SUCCESS",
              "failed": "FAILURE"
            }
          }
        },
        "download": {
          "headers": {
            "X-Download-Key": "{api_key}"
          }
        }
      }
    }
  ]
}
```

`request_mode: "passthrough"` forwards the client JSON while replacing its
`model` with the mapped upstream model. `request_mode: "template"` constructs a
new JSON body. An exact placeholder preserves its JSON type, so arrays, objects,
numbers, booleans, and strings are not converted to strings. If an exact field
such as `{request.optional}` does not exist, that property is omitted.

Response paths use GJSON syntax. Status map values must be `SUBMITTED`,
`QUEUED`, `IN_PROGRESS`, `SUCCESS`, or `FAILURE`. The exact route is copied into
the task's private data at submission time, so editing channel configuration
does not break tasks that are already running.

## Synchronous JSON mapping

For a non-streaming provider with its own JSON field names, set
`request_body_template` and optionally `response_body_template` on the route:

```json
{
  "incoming_path": "/v1/images/generations",
  "upstream_path": "https://provider.example/generate",
  "converter": "none",
  "models": ["private-image-v1"],
  "request_body_template": {
    "engine": "{model}",
    "text": "{request.prompt}",
    "count": "{request.n}"
  },
  "response_body_template": {
    "created": "{response.created_at}",
    "data": "{response.outputs}"
  }
}
```

Response templates use `{response.path}` placeholders and must produce the
public response contract expected by clients. They intentionally do not support
streaming. Because a generic response template does not infer token usage, use
fixed per-call pricing for such a route. Protocol-compatible streaming routes
can still use native forwarding or a registered converter.

## Cloudflare video delivery

Deploy the Worker in `deploy/cloudflare-video-worker`, configure the same
32-character-or-longer secret in Cloudflare and the system settings, and set the
Video Worker URL. The public content endpoint then returns a short `307`
redirect. Its encrypted, authenticated token contains the private upstream URL,
required download headers, and a 15-minute expiration. The Worker supports
`GET`, `HEAD`, range requests, conditional requests, and validated redirects.
Video bytes never pass through the gateway.
