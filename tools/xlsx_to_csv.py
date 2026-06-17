#!/usr/bin/env python3
"""Convert a worksheet in an .xlsx file to CSV using only stdlib."""

from __future__ import annotations

import argparse
import csv
import re
import sys
import zipfile
from pathlib import Path
from xml.etree import ElementTree

NS = {
    "a": "http://schemas.openxmlformats.org/spreadsheetml/2006/main",
    "r": "http://schemas.openxmlformats.org/officeDocument/2006/relationships",
    "rel": "http://schemas.openxmlformats.org/package/2006/relationships",
}


def read_xml(zf: zipfile.ZipFile, name: str) -> ElementTree.Element:
    return ElementTree.fromstring(zf.read(name))


def shared_strings(zf: zipfile.ZipFile) -> list[str]:
    if "xl/sharedStrings.xml" not in zf.namelist():
        return []
    root = read_xml(zf, "xl/sharedStrings.xml")
    values: list[str] = []
    for item in root.findall("a:si", NS):
        parts = [node.text or "" for node in item.findall(".//a:t", NS)]
        values.append("".join(parts))
    return values


def workbook_sheets(zf: zipfile.ZipFile) -> list[tuple[str, str]]:
    workbook = read_xml(zf, "xl/workbook.xml")
    rels = read_xml(zf, "xl/_rels/workbook.xml.rels")
    rel_targets = {}
    for rel in rels.findall("rel:Relationship", NS):
        target = rel.attrib["Target"].lstrip("/")
        rel_targets[rel.attrib["Id"]] = target if target.startswith("xl/") else f"xl/{target}"

    sheets = []
    for sheet in workbook.findall("a:sheets/a:sheet", NS):
        rel_id = sheet.attrib[f"{{{NS['r']}}}id"]
        name = sheet.attrib.get("name", "")
        if rel_id in rel_targets:
            sheets.append((name, rel_targets[rel_id]))
    return sheets


def sheet_path(zf: zipfile.ZipFile, sheet_name: str | None) -> str:
    sheets = workbook_sheets(zf)
    if not sheets:
        raise ValueError("workbook has no worksheet")

    if sheet_name:
        normalized = sheet_name.casefold()
        for name, path in sheets:
            if name.casefold() == normalized:
                return path
        available = ", ".join(name for name, _path in sheets)
        raise ValueError(f"cannot find worksheet {sheet_name!r}; available sheets: {available}")

    for name, path in sheets:
        if name.casefold() == "sheet1":
            return path
    return sheets[0][1]


def column_index(cell_ref: str) -> int:
    letters = re.match(r"([A-Z]+)", cell_ref)
    if not letters:
        return 0
    index = 0
    for char in letters.group(1):
        index = index * 26 + ord(char) - ord("A") + 1
    return index - 1


def cell_text(cell: ElementTree.Element, strings: list[str]) -> str:
    cell_type = cell.attrib.get("t")
    if cell_type == "inlineStr":
        return "".join(node.text or "" for node in cell.findall(".//a:t", NS))
    value = cell.find("a:v", NS)
    if value is None or value.text is None:
        return ""
    raw = value.text
    if cell_type == "s":
        try:
            return strings[int(raw)]
        except (ValueError, IndexError):
            return raw
    return raw


def convert(input_path: Path, output_path: Path, sheet_name: str | None = None) -> None:
    with zipfile.ZipFile(input_path) as zf:
        strings = shared_strings(zf)
        sheet = read_xml(zf, sheet_path(zf, sheet_name))
        rows: list[list[str]] = []
        for row in sheet.findall(".//a:sheetData/a:row", NS):
            output: list[str] = []
            for cell in row.findall("a:c", NS):
                ref = cell.attrib.get("r", "")
                index = column_index(ref)
                while len(output) <= index:
                    output.append("")
                output[index] = cell_text(cell, strings)
            rows.append(output)

    max_width = max((len(row) for row in rows), default=0)
    with output_path.open("w", newline="", encoding="utf-8-sig") as handle:
        writer = csv.writer(handle)
        for row in rows:
            writer.writerow(row + [""] * (max_width - len(row)))


def main() -> int:
    parser = argparse.ArgumentParser(description="Convert one worksheet of .xlsx to CSV.")
    parser.add_argument("input", type=Path)
    parser.add_argument("output", type=Path)
    parser.add_argument("--sheet", help="Worksheet name to convert. Defaults to Sheet1 when present.")
    parser.add_argument("--list-sheets", action="store_true", help="Print worksheet names and exit.")
    args = parser.parse_args()

    if not args.input.exists():
        print(f"Input file not found: {args.input}", file=sys.stderr)
        return 1
    if args.list_sheets:
      with zipfile.ZipFile(args.input) as zf:
          for name, _path in workbook_sheets(zf):
              print(name)
      return 0
    convert(args.input, args.output, args.sheet)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
