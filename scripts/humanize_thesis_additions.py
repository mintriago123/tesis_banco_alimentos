#!/usr/bin/env python3
"""Create a separate, humanized copy of the revised thesis DOCX."""

from copy import deepcopy
from pathlib import Path
from tempfile import TemporaryDirectory
from zipfile import ZIP_DEFLATED, ZipFile
import xml.etree.ElementTree as ET


W = "http://schemas.openxmlformats.org/wordprocessingml/2006/main"
XML = "http://www.w3.org/XML/1998/namespace"
NS = {"w": W}
ET.register_namespace("w", W)


def paragraph_text(paragraph: ET.Element) -> str:
    return "".join(node.text or "" for node in paragraph.findall(".//w:t", NS))


def replace_paragraph_text(paragraph: ET.Element, text: str) -> None:
    runs = paragraph.findall("w:r", NS)
    preserved_rpr = None
    if runs:
        rpr = runs[0].find("w:rPr", NS)
        if rpr is not None:
            preserved_rpr = deepcopy(rpr)
    for child in list(paragraph):
        if child.tag != f"{{{W}}}pPr":
            paragraph.remove(child)
    run = ET.SubElement(paragraph, f"{{{W}}}r")
    if preserved_rpr is not None:
        run.append(preserved_rpr)
    node = ET.SubElement(run, f"{{{W}}}t")
    if text.startswith(" ") or text.endswith(" "):
        node.set(f"{{{XML}}}space", "preserve")
    node.text = text


def replace_by_prefix(paragraphs: list[ET.Element], prefix: str, text: str) -> None:
    for paragraph in paragraphs:
        if paragraph_text(paragraph).startswith(prefix):
            replace_paragraph_text(paragraph, text)
            return
    raise RuntimeError(f"No se encontró: {prefix}")


def main() -> None:
    source = Path("Tesis_Capitulos_I_y_III_corregidos.docx")
    target = Path("Tesis_Capitulos_I_y_III_humanizados.docx")
    replacements = {
        "La pérdida y el desperdicio de alimentos constituyen":
            "La pérdida y el desperdicio de alimentos afectan la eficiencia de los sistemas alimentarios. En 2022 se desperdiciaron cerca de 1.050 millones de toneladas en hogares, servicios alimentarios y comercios minoristas. Esta cantidad equivale a 132 kilogramos por persona al año (Programa de las Naciones Unidas para el Medio Ambiente [PNUMA], 2024). En América Latina y el Caribe, las pérdidas y desperdicios llegan hasta 127 millones de toneladas anuales (Organización de las Naciones Unidas para la Alimentación y la Agricultura [FAO], 2016). Los datos muestran la necesidad de aprovechar mejor los excedentes que todavía son aptos para el consumo humano.",
        "La presente investigación desarrolla un prototipo académico independiente":
            "Esta investigación desarrolla un prototipo académico independiente para gestionar donaciones alimentarias bajo un modelo descentralizado. Manta, provincia de Manabí, se toma solo como referencia geográfica. El proyecto no pertenece a un banco de alimentos ni supone que alguna institución vaya a adoptarlo. Tampoco cuenta todavía con una red confirmada de donantes o beneficiarios, datos de operación ni un historial de donaciones. Por esta razón, el trabajo se concentra en diseñar y validar la plataforma con datos simulados. El sistema registra cada producto, lote, cantidad, unidad de medida, fecha de vencimiento y lugar de custodia.",
        "En una eventual operación basada en este modelo descentralizado":
            "Si este modelo se aplicara en una operación real, el manejo manual podría dispersar la información y dificultar la consulta del stock disponible. También complicaría la prioridad de los productos próximos a caducar mediante FEFO (First Expired, First Out), el seguimiento del alimento hasta su entrega y la coordinación entre los participantes. La plataforma propuesta reúne las existencias distribuidas en un solo registro y conserva los movimientos de los productos recibidos, asignados, entregados o dados de baja.",
        "Este capítulo establece el procedimiento previsto":
            "Este capítulo explica cómo se estudió el problema y cómo se planificó el prototipo. Las funciones ya construidas, las rutas de código, la arquitectura, las funciones de PostgreSQL y los resultados de las pruebas se presentan en el Capítulo IV, porque corresponden a la ejecución del proyecto.",
        "La investigación es aplicada y de alcance descriptivo":
            "La investigación es aplicada, descriptiva y no experimental. Busca formular y evaluar un prototipo para gestionar donaciones cuyos productos permanecen en distintos lugares de custodia. Manta se utiliza como referencia geográfica, pero el estudio no analiza un banco de alimentos en funcionamiento ni atribuye la propuesta a una institución.",
        "La revisión documental comprende":
            "La revisión documental abarca los antecedentes del Capítulo II, la normativa ecuatoriana citada y la documentación técnica del prototipo. De estas fuentes se obtuvieron las categorías usadas para analizar el sistema: actores, productos, lotes, cantidades, unidades de medida, fechas de vencimiento, lugares de custodia, estados y comprobantes de entrega. Estas categorías sirvieron para redactar los requisitos y los escenarios de uso.",
        "Para evaluar la pertinencia y utilidad del producto":
            "La utilidad del prototipo se evaluará con una prueba guiada y una entrevista semiestructurada. Se buscará a una persona con experiencia en donaciones, asistencia social, inventarios, logística, distribución de alimentos o trabajo comunitario. No tiene que representar a un banco de alimentos formal. Lo necesario es que conozca alguno de estos procesos y pueda opinar sobre el funcionamiento propuesto desde una perspectiva operativa o social.",
        "Al cierre de esta versión todavía no se ha confirmado":
            "En esta versión todavía no se ha confirmado al evaluador externo. La fecha, su perfil y los resultados quedarán pendientes hasta realizar la actividad. Una vez aplicada, sus resultados se incluirán en el Capítulo IV. Esta evaluación permitirá saber si el prototipo es comprensible y si puede ser útil en la práctica. No permitirá medir una reducción real del desperdicio, ya que eso exigiría utilizar el sistema durante un periodo definido y comparar resultados operativos.",
        "Debido a la ausencia de una organización observada":
            "Como no se ha observado una organización real, el proceso AS-IS se plantea como un escenario de referencia obtenido de la revisión documental. En este escenario, el donante informa un excedente por teléfono, mensajería o correo. Luego, un coordinador anota el producto, la cantidad, el vencimiento y su ubicación. Las solicitudes llegan por canales separados y se comparan con registros que no siempre están sincronizados. El retiro y la entrega se coordinan manualmente, y el cierre depende de mensajes o archivos guardados en distintos lugares.",
        "Este flujo puede producir desactualización del stock":
            "Este proceso puede dejar cantidades desactualizadas, generar dos asignaciones sobre el mismo producto y perder de vista los lotes que vencen primero. También dificulta comprobar quién autorizó o recibió cada movimiento. Son problemas previstos a partir de la documentación consultada, no hallazgos observados en una organización de Manta. Deberán contrastarse cuando se consiga una contraparte.",
        "Para seleccionar el proceso de desarrollo se comparan":
            "La selección del proceso de desarrollo consideró XP, Scrum y Kanban. XP propone prácticas de ingeniería para trabajar con cambios frecuentes y cuidar la calidad interna del software (Beck & Andres, 2004). Scrum organiza el trabajo mediante un equipo, objetivos, eventos y artefactos (Schwaber & Sutherland, 2020). Kanban se enfoca en mostrar el flujo, limitar el trabajo en curso y medir su avance (Coleman et al., 2025). La Tabla 3.1 resume las diferencias que influyeron en la elección.",
        "Se selecciona XP de forma adaptada":
            "Se eligió una versión adaptada de XP porque el proyecto lo desarrolla una sola persona, los requisitos pueden cambiar durante la construcción y las reglas de inventario necesitan pruebas frecuentes. El plan conserva historias de usuario, entregas pequeñas, diseño simple, normas de codificación, refactorización, integración frecuente y pruebas automatizadas. No incluye programación en pareja ni un cliente disponible de forma continua, pues no hay otra persona u organización que cumpla esos papeles.",
        "La planificación organiza el producto en cinco incrementos":
            "El desarrollo se divide en cinco incrementos. El primero abarca el acceso, los perfiles y los permisos. El segundo incluye donantes, bodegas y registro de donaciones. El tercero se ocupa del inventario por lote y los vencimientos. El cuarto cubre las solicitudes, la asignación y la trazabilidad de las entregas. El quinto integra las notificaciones, los reportes y la verificación general. Cada incremento debe tener criterios de aceptación y pruebas antes de continuar con el siguiente.",
        "Estado: pendiente de aplicación.":
            "Estado: pendiente de aplicación. Fecha: [por completar]. Evaluador: [nombre o código y perfil por completar]. Se seleccionará a una persona con experiencia en donaciones, asistencia social, inventarios, logística, distribución de alimentos o gestión comunitaria. La actividad busca conocer si el prototipo resulta claro, pertinente y potencialmente útil. Primero se presentará el sistema; después, el evaluador realizará varias tareas y responderá una entrevista semiestructurada. Su participación será voluntaria y deberá autorizar el uso académico de sus respuestas.",
        "Tareas propuestas: registrar una donación simulada":
            "El evaluador deberá registrar una donación simulada, consultar el lote y su ubicación, crear una solicitud, revisar la asignación y consultar el historial hasta la entrega. Después responderá estas preguntas: (1) ¿El flujo permite entender cómo se coordinarían las donaciones? (2) ¿Qué información hace falta para tomar decisiones? (3) ¿Qué pasos resultan confusos o innecesarios? (4) ¿El historial de movimientos ayudaría a controlar las entregas? (5) ¿En qué tipo de organización podría ser útil? (6) ¿Qué problema impediría usarlo? El registro incluirá las tareas completadas, las dificultades, las respuestas y las sugerencias. Resultado: [por completar después de la aplicación].",
    }

    with TemporaryDirectory(prefix="tesis-humanizada-") as temp_dir:
        temp = Path(temp_dir)
        with ZipFile(source) as archive:
            archive.extractall(temp)
        document_path = temp / "word" / "document.xml"
        tree = ET.parse(document_path)
        root = tree.getroot()
        paragraphs = root.findall(".//w:body/w:p", NS)
        for prefix, text in replacements.items():
            replace_by_prefix(paragraphs, prefix, text)
        tree.write(document_path, encoding="UTF-8", xml_declaration=True)
        with ZipFile(target, "w", ZIP_DEFLATED) as output:
            for path in sorted(temp.rglob("*")):
                if path.is_file():
                    output.write(path, path.relative_to(temp))
    print(target.resolve())


if __name__ == "__main__":
    main()
