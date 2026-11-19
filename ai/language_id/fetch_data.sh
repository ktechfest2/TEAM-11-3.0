#!/bin/bash
# Training/eval audio for the spoken-language detector (all openly licensed). Partial downloads:
# the first ~60 MB of each FLEURS dev archive is enough (70-140 clips per language).
#   ai/language_id/fetch_data.sh <data_dir>
set -u
D="${1:?data dir}"; mkdir -p "$D/naijavox"; cd "$D"
for l in yo_ng ha_ng ig_ng en_us; do                       # google/fleurs, CC-BY 4.0
  mkdir -p $l
  curl -4 -sSL -m 900 -r 0-62000000 -o $l.part.tar.gz "https://huggingface.co/datasets/google/fleurs/resolve/main/data/$l/audio/dev.tar.gz"
  (cd $l && tar -xzf ../$l.part.tar.gz 2>/dev/null; true)
  echo "$l: $(find $l -name '*.wav' | wc -l) clips"
done
# Nigerian-accented English (Apache-2.0) and Nigerian Pidgin (CC-BY 4.0), parquet with audio bytes.
curl -4 -sSL -o ng_en_test.parquet "https://huggingface.co/datasets/benjaminogbonna/nigerian_accented_english_dataset/resolve/main/data/test-00000-of-00001.parquet"
curl -4 -sSL -o ng_en_val.parquet "https://huggingface.co/datasets/benjaminogbonna/nigerian_accented_english_dataset/resolve/main/data/validation-00000-of-00001.parquet"
curl -4 -sSL -o pcm_val.parquet "https://huggingface.co/datasets/asr-nigerian-pidgin/nigerian-pidgin-1.0/resolve/main/data/validation-00000-of-00001-b91747625e760fc5.parquet"
# Real speaker samples used only for evaluation (Axiveri/NaijaVox-2.0, Apache-2.0).
for f in english pidgin yoruba hausa igbo; do for n in 1 2; do
  curl -4 -sSL -o naijavox/${f}_sample$n.wav "https://huggingface.co/Axiveri/NaijaVox-2.0/resolve/main/audio_samples/${f}_sample$n.wav"
done; done
# Unpack the parquet audio to 16 kHz WAV (needs: pip install pyarrow soundfile).
"$(dirname "$0")/../.venv/bin/python" -I "$(dirname "$(realpath "$0")")/unpack_parquet.py" "$D"
