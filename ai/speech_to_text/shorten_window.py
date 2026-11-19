"""Let a Whisper ONNX encoder accept SHORTER audio windows than 30 s (the "audio_ctx" trick).

Whisper always encodes a 30-second window: 3000 mel frames -> 1500 encoder positions, even for a
2-second voice command. On a phone (WebAssembly) that full window costs ~5-15 s. The exported
encoder hard-codes only one thing about the length: it adds the whole 1500-row positional table.
This rewrites that Add to use only the first N rows (N = actual length) and makes the input
length dynamic, so the app can encode e.g. an 8 s window (~3-4x less work). Weights unchanged.

    ai/.venv/bin/python ai/speech_to_text/shorten_window.py <encoder.onnx> [<out.onnx>]   # in place by default
"""
import sys

import numpy as np
import onnx
from onnx import helper, numpy_helper


def patch(path_in, path_out=None):
    m = onnx.load(path_in)
    g = m.graph
    inits = {i.name: i for i in g.initializer}
    pos = [k for k, v in inits.items() if len(v.dims) == 2 and v.dims[0] == 1500]
    if not pos:
        if any(n.name == "awavote_pos_slice" for n in g.node):
            print("already patched:", path_in); return False
        raise SystemExit("positional table (1500 x d) not found")
    pos = pos[0]
    add = next(n for n in g.node if n.op_type == "Add" and pos in n.input)
    x = next(i for i in add.input if i != pos)
    one = numpy_helper.from_array(np.array([1], dtype=np.int64), "awavote_one")
    zero = numpy_helper.from_array(np.array([0], dtype=np.int64), "awavote_zero")
    g.initializer.extend([one, zero])
    new = [
        helper.make_node("Shape", [x], ["awavote_shape"], name="awavote_shape"),
        helper.make_node("Gather", ["awavote_shape", "awavote_one"], ["awavote_len"], axis=0, name="awavote_len"),
        helper.make_node("Slice", [pos, "awavote_zero", "awavote_len", "awavote_zero"], ["awavote_pos"], name="awavote_pos_slice"),
    ]
    add.input[list(add.input).index(pos)] = "awavote_pos"
    idx = list(g.node).index(add)
    for k, n in enumerate(new):
        g.node.insert(idx + k, n)
    inp = g.input[0]
    inp.type.tensor_type.shape.dim[2].ClearField("dim_value")
    inp.type.tensor_type.shape.dim[2].dim_param = "n_frames"
    for o in list(g.output) + list(g.value_info):  # the sequence length now follows the input
        for d in o.type.tensor_type.shape.dim:
            if d.dim_value == 1500:
                d.ClearField("dim_value"); d.dim_param = "n_positions"
    onnx.checker.check_model(m)
    onnx.save(m, path_out or path_in)
    print("patched:", path_out or path_in)
    return True


if __name__ == "__main__":
    patch(sys.argv[1], sys.argv[2] if len(sys.argv) > 2 else None)
