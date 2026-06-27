"""FastAPI WebSocket bridge for the CareVoice ADK Live agent."""

import asyncio
import base64
import json
import logging
import warnings

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from google.adk.agents.live_request_queue import LiveRequestQueue
from google.adk.agents.run_config import RunConfig, StreamingMode
from google.adk.runners import Runner
from google.adk.sessions import InMemorySessionService
from google.genai import types

from .agent import agent
from .config import settings
from .carevoice_tools import bind_call_context, reset_call_context

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)
warnings.filterwarnings("ignore", category=UserWarning, module="pydantic")

app = FastAPI(title="CareVoice ADK Voice Agent")
session_service = InMemorySessionService()
runner = Runner(
    app_name=settings.app_name,
    agent=agent,
    session_service=session_service,
)


@app.get("/health")
async def health() -> dict[str, str | bool]:
    return {
        "ok": True,
        "service": "carevoice-adk-voice-agent",
        "model": settings.live_model,
    }


@app.websocket("/ws/{user_id}/{session_id}")
async def websocket_endpoint(
    websocket: WebSocket,
    user_id: str,
    session_id: str,
    audio_response: bool = True,
) -> None:
    await websocket.accept()

    run_config = RunConfig(
        streaming_mode=StreamingMode.BIDI,
        response_modalities=["AUDIO"] if audio_response else ["TEXT"],
        input_audio_transcription=types.AudioTranscriptionConfig(),
        output_audio_transcription=types.AudioTranscriptionConfig(),
        session_resumption=types.SessionResumptionConfig(),
    )

    session = await session_service.get_session(
        app_name=settings.app_name,
        user_id=user_id,
        session_id=session_id,
    )
    if not session:
        await session_service.create_session(
            app_name=settings.app_name,
            user_id=user_id,
            session_id=session_id,
        )

    live_request_queue = LiveRequestQueue()
    context_tokens = bind_call_context(user_id, session_id)

    async def upstream_task() -> None:
        while True:
            try:
                message = await websocket.receive()
            except WebSocketDisconnect:
                logger.info("ADK voice client disconnected: %s/%s", user_id, session_id)
                return
            except RuntimeError as error:
                if "Cannot call \"receive\" once a disconnect message has been received" in str(error):
                    logger.info("ADK voice client disconnected: %s/%s", user_id, session_id)
                    return
                raise

            if "bytes" in message:
                live_request_queue.send_realtime(
                    types.Blob(
                        mime_type="audio/pcm;rate=16000",
                        data=message["bytes"],
                    )
                )
                continue

            if "text" not in message:
                continue

            payload = json.loads(message["text"])
            message_type = payload.get("type")

            if message_type == "text":
                live_request_queue.send_content(
                    types.Content(parts=[types.Part(text=payload["text"])])
                )
            elif message_type == "image":
                live_request_queue.send_realtime(
                    types.Blob(
                        mime_type=payload.get("mimeType", "image/jpeg"),
                        data=base64.b64decode(payload["data"]),
                    )
                )

    async def downstream_task() -> None:
        async for event in runner.run_live(
            user_id=user_id,
            session_id=session_id,
            live_request_queue=live_request_queue,
            run_config=run_config,
        ):
            await websocket.send_text(
                event.model_dump_json(exclude_none=True, by_alias=True)
            )

    try:
        upstream = asyncio.create_task(upstream_task())
        downstream = asyncio.create_task(downstream_task())
        done, pending = await asyncio.wait(
            {upstream, downstream},
            return_when=asyncio.FIRST_COMPLETED,
        )

        for task in done:
            exception = task.exception()
            if exception:
                raise exception

        for task in pending:
            task.cancel()
        await asyncio.gather(*pending, return_exceptions=True)
    except WebSocketDisconnect:
        logger.info("ADK voice client disconnected: %s/%s", user_id, session_id)
    except Exception:
        logger.exception("ADK voice session failed: %s/%s", user_id, session_id)
    finally:
        live_request_queue.close()
        reset_call_context(context_tokens)
