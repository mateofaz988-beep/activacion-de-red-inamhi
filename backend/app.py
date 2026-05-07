from io import BytesIO
from flask import send_file
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import cm
from reportlab.platypus import (
    SimpleDocTemplate,
    Paragraph,
    Spacer,
    Table,
    TableStyle,
    PageBreak
)
import os
import re
import ipaddress
import datetime
from functools import wraps
from urllib.parse import urlparse

from flask import Flask, jsonify, request
from flask_cors import CORS
from dotenv import load_dotenv

import mysql.connector
from mysql.connector import Error

import jwt
import bcrypt


# =====================================================
# cargar variables de entorno
# =====================================================

load_dotenv()


# =====================================================
# configuración principal
# =====================================================

app = Flask(__name__)

CORS(app, resources={
    r"/api/*": {
        "origins": [
            "http://localhost:4300",
            "http://127.0.0.1:4300"
        ]
    }
})

app.config["MAX_CONTENT_LENGTH"] = 10 * 1024 * 1024  # 10 mb

DB_HOST = os.getenv("DB_HOST", "localhost")
DB_PORT = int(os.getenv("DB_PORT", 3306))
DB_USER = os.getenv("DB_USER", "root")
DB_PASSWORD = os.getenv("DB_PASSWORD", "")
DB_NAME = os.getenv("DB_NAME", "inamhi_liberacion_web")

JWT_SECRET_KEY = os.getenv("JWT_SECRET_KEY", "inamhi_liberacion_web_secret_2026")
JWT_EXPIRATION_HOURS = int(os.getenv("JWT_EXPIRATION_HOURS", 8))

BACKEND_HOST = os.getenv("BACKEND_HOST", "127.0.0.1")
BACKEND_PORT = int(os.getenv("BACKEND_PORT", 5050))

UPLOAD_FOLDER = "uploads"
DOCUMENTOS_FOLDER = os.path.join(UPLOAD_FOLDER, "documentos")
FIRMADOS_FOLDER = os.path.join(UPLOAD_FOLDER, "firmados")
ESCANEADOS_FOLDER = os.path.join(UPLOAD_FOLDER, "escaneados")


# =====================================================
# crear carpetas necesarias
# =====================================================

def crear_carpetas():
    carpetas = [
        UPLOAD_FOLDER,
        DOCUMENTOS_FOLDER,
        FIRMADOS_FOLDER,
        ESCANEADOS_FOLDER,
        "logs"
    ]

    for carpeta in carpetas:
        if not os.path.exists(carpeta):
            os.makedirs(carpeta)


crear_carpetas()


# =====================================================
# conexión mysql
# =====================================================

def get_db_connection():
    try:
        conexion = mysql.connector.connect(
            host=DB_HOST,
            port=DB_PORT,
            user=DB_USER,
            password=DB_PASSWORD,
            database=DB_NAME
        )

        if conexion.is_connected():
            return conexion

        return None

    except Error as error:
        print("error al conectar con mysql:", error)
        return None


# =====================================================
# utilidades generales
# =====================================================

def limpiar_texto(valor):
    if valor is None:
        return ""
    return str(valor).strip()


def obtener_ip_cliente():
    forwarded_for = request.headers.get("X-Forwarded-For")

    if forwarded_for:
        return forwarded_for.split(",")[0].strip()

    return request.remote_addr


def normalizar_espacios(texto):
    texto = limpiar_texto(texto)
    return re.sub(r"\s+", " ", texto)


def validar_solo_letras_espacios(texto):
    patron = r"^[a-zA-ZáéíóúÁÉÍÓÚñÑüÜ\s]+$"
    return re.match(patron, texto) is not None


def validar_correo_inamhi(correo):
    correo = limpiar_texto(correo).lower()

    patron_correo = r"^[a-zA-Z0-9._%+-]+@inamhi\.gob\.ec$"

    return re.match(patron_correo, correo) is not None


def validar_cedula_formato(cedula):
    cedula = limpiar_texto(cedula)
    return cedula.isdigit() and len(cedula) == 10


def validar_telefono_10_digitos(telefono):
    telefono = limpiar_texto(telefono)
    return telefono.isdigit() and len(telefono) == 10


def validar_ipv4(ip):
    ip = limpiar_texto(ip)

    try:
        ipaddress.IPv4Address(ip)
        return True
    except Exception:
        return False


def validar_url(url):
    url = limpiar_texto(url)

    if not url:
        return False

    if " " in url:
        return False

    try:
        resultado = urlparse(url)

        if resultado.scheme not in ["http", "https"]:
            return False

        if not resultado.netloc:
            return False

        return True

    except Exception:
        return False


def validar_fecha(fecha):
    fecha = limpiar_texto(fecha)

    try:
        datetime.datetime.strptime(fecha, "%Y-%m-%d")
        return True
    except ValueError:
        return False


def convertir_fecha(fecha):
    return datetime.datetime.strptime(fecha, "%Y-%m-%d").date()


def generar_codigo_solicitud():
    anio = datetime.datetime.now().year
    prefijo = f"INAMHI-WEB-{anio}-"

    conexion = get_db_connection()

    if conexion is None:
        return None

    try:
        cursor = conexion.cursor(dictionary=True)

        sql = """
            select codigo_solicitud
            from solicitudes
            where codigo_solicitud like %s
            order by id desc
            limit 1;
        """

        cursor.execute(sql, (f"{prefijo}%",))
        ultimo = cursor.fetchone()

        cursor.close()
        conexion.close()

        if ultimo is None:
            numero = 1
        else:
            codigo_actual = ultimo["codigo_solicitud"]
            numero_actual = int(codigo_actual.split("-")[-1])
            numero = numero_actual + 1

        return f"{prefijo}{str(numero).zfill(4)}"

    except Exception as error:
        print("error al generar código:", error)
        return None


def registrar_auditoria(usuario_id, solicitud_id, modulo, accion, descripcion, datos_anteriores=None, datos_nuevos=None):
    conexion = get_db_connection()

    if conexion is None:
        return False

    try:
        cursor = conexion.cursor()

        sql = """
            insert into auditoria (
                usuario_id,
                solicitud_id,
                modulo,
                accion,
                descripcion,
                datos_anteriores,
                datos_nuevos,
                ip_origen
            ) values (
                %s, %s, %s, %s, %s, %s, %s, %s
            );
        """

        import json

        cursor.execute(sql, (
            usuario_id,
            solicitud_id,
            modulo,
            accion,
            descripcion,
            json.dumps(datos_anteriores, ensure_ascii=False) if datos_anteriores else None,
            json.dumps(datos_nuevos, ensure_ascii=False) if datos_nuevos else None,
            obtener_ip_cliente()
        ))

        conexion.commit()
        cursor.close()
        conexion.close()

        return True

    except Error as error:
        print("error al registrar auditoría:", error)
        return False


# =====================================================
# validación fuerte de solicitud pública
# =====================================================

def validar_solicitud_publica(data):
    errores = {}

    nombres_completos = normalizar_espacios(data.get("nombres_completos"))
    cedula = limpiar_texto(data.get("cedula"))
    correo_institucional = limpiar_texto(data.get("correo_institucional")).lower()
    telefono_ext = limpiar_texto(data.get("telefono_ext"))
    dependencia = normalizar_espacios(data.get("dependencia"))
    area_unidad = normalizar_espacios(data.get("area_unidad"))
    cargo = normalizar_espacios(data.get("cargo"))
    fecha_solicitud = limpiar_texto(data.get("fecha_solicitud"))
    tipo_usuario = limpiar_texto(data.get("tipo_usuario"))
    nombre_usuario_externo = normalizar_espacios(data.get("nombre_usuario_externo"))
    direccion_ip = limpiar_texto(data.get("direccion_ip"))
    tiempo_vigencia_acceso = normalizar_espacios(data.get("tiempo_vigencia_acceso"))
    justificacion = normalizar_espacios(data.get("justificacion_necesidad_institucional"))
    paginas_web = data.get("paginas_web")

    # nombres completos
    if not nombres_completos:
        errores["nombres_completos"] = "los nombres completos son obligatorios."
    elif len(nombres_completos) < 5:
        errores["nombres_completos"] = "los nombres completos deben tener mínimo 5 caracteres."
    elif len(nombres_completos) > 200:
        errores["nombres_completos"] = "los nombres completos no pueden superar 200 caracteres."
    elif not validar_solo_letras_espacios(nombres_completos):
        errores["nombres_completos"] = "los nombres completos solo pueden contener letras y espacios."

    # cédula
    if not cedula:
        errores["cedula"] = "la cédula es obligatoria."
    elif not validar_cedula_formato(cedula):
        errores["cedula"] = "la cédula debe contener exactamente 10 números."

    # correo institucional
    if not correo_institucional:
        errores["correo_institucional"] = "el correo institucional es obligatorio."
    elif not validar_correo_inamhi(correo_institucional):
        errores["correo_institucional"] = "el correo debe pertenecer al dominio @inamhi.gob.ec."

    # teléfono
    if not telefono_ext:
        errores["telefono_ext"] = "el teléfono es obligatorio."
    elif not validar_telefono_10_digitos(telefono_ext):
        errores["telefono_ext"] = "el teléfono debe contener exactamente 10 números."

    # dependencia
    if not dependencia:
        errores["dependencia"] = "la dependencia es obligatoria."
    elif len(dependencia) < 3:
        errores["dependencia"] = "la dependencia debe tener mínimo 3 caracteres."
    elif len(dependencia) > 150:
        errores["dependencia"] = "la dependencia no puede superar 150 caracteres."

    # área / unidad
    if not area_unidad:
        errores["area_unidad"] = "el área o unidad es obligatoria."
    elif len(area_unidad) < 3:
        errores["area_unidad"] = "el área o unidad debe tener mínimo 3 caracteres."
    elif len(area_unidad) > 150:
        errores["area_unidad"] = "el área o unidad no puede superar 150 caracteres."

    # cargo
    if not cargo:
        errores["cargo"] = "el cargo es obligatorio."
    elif len(cargo) < 3:
        errores["cargo"] = "el cargo debe tener mínimo 3 caracteres."
    elif len(cargo) > 150:
        errores["cargo"] = "el cargo no puede superar 150 caracteres."

    # fecha
    if not fecha_solicitud:
        errores["fecha_solicitud"] = "la fecha de solicitud es obligatoria."
    elif not validar_fecha(fecha_solicitud):
        errores["fecha_solicitud"] = "la fecha debe tener formato yyyy-mm-dd."

    # tipo usuario
    tipos_validos = ["funcionario_inamhi", "externo"]

    if not tipo_usuario:
        errores["tipo_usuario"] = "el tipo de usuario es obligatorio."
    elif tipo_usuario not in tipos_validos:
        errores["tipo_usuario"] = "el tipo de usuario solo puede ser funcionario_inamhi o externo."

    # externo
    if tipo_usuario == "externo":
        if not nombre_usuario_externo:
            errores["nombre_usuario_externo"] = "el nombre del usuario externo es obligatorio."
        elif len(nombre_usuario_externo) < 5:
            errores["nombre_usuario_externo"] = "el nombre del usuario externo debe tener mínimo 5 caracteres."
        elif len(nombre_usuario_externo) > 200:
            errores["nombre_usuario_externo"] = "el nombre del usuario externo no puede superar 200 caracteres."

        if not direccion_ip:
            errores["direccion_ip"] = "la dirección ip es obligatoria para usuario externo."
        elif not validar_ipv4(direccion_ip):
            errores["direccion_ip"] = "la dirección ip debe tener formato ipv4 válido."

    if tipo_usuario == "funcionario_inamhi":
        if direccion_ip and not validar_ipv4(direccion_ip):
            errores["direccion_ip"] = "la dirección ip debe tener formato ipv4 válido."

    # vigencia
    if not tiempo_vigencia_acceso:
        errores["tiempo_vigencia_acceso"] = "el tiempo de vigencia del acceso es obligatorio."
    elif len(tiempo_vigencia_acceso) < 3:
        errores["tiempo_vigencia_acceso"] = "el tiempo de vigencia debe tener mínimo 3 caracteres."
    elif len(tiempo_vigencia_acceso) > 100:
        errores["tiempo_vigencia_acceso"] = "el tiempo de vigencia no puede superar 100 caracteres."

    # justificación
    if not justificacion:
        errores["justificacion_necesidad_institucional"] = "la justificación es obligatoria."
    elif len(justificacion) < 20:
        errores["justificacion_necesidad_institucional"] = "la justificación debe tener mínimo 20 caracteres."
    elif len(justificacion) > 2000:
        errores["justificacion_necesidad_institucional"] = "la justificación no puede superar 2000 caracteres."

    # páginas web
    if not isinstance(paginas_web, list):
        errores["paginas_web"] = "las páginas web deben enviarse como una lista."
    else:
        paginas_limpias = []

        for pagina in paginas_web:
            if isinstance(pagina, dict):
                url = limpiar_texto(pagina.get("url_pagina"))
                descripcion = normalizar_espacios(pagina.get("descripcion"))
            else:
                url = limpiar_texto(pagina)
                descripcion = ""

            if url:
                paginas_limpias.append({
                    "url_pagina": url,
                    "descripcion": descripcion
                })

        if len(paginas_limpias) < 1:
            errores["paginas_web"] = "debe ingresar al menos una página web importante."
        elif len(paginas_limpias) > 8:
            errores["paginas_web"] = "solo se permiten máximo 8 páginas web."
        else:
            for index, pagina in enumerate(paginas_limpias, start=1):
                if len(pagina["url_pagina"]) > 255:
                    errores[f"pagina_{index}"] = "la url no puede superar 255 caracteres."
                elif not validar_url(pagina["url_pagina"]):
                    errores[f"pagina_{index}"] = "la url debe ser válida e iniciar con http:// o https://."

                if len(pagina["descripcion"]) > 255:
                    errores[f"descripcion_pagina_{index}"] = "la descripción de la página no puede superar 255 caracteres."

    datos_limpios = {
        "nombres_completos": nombres_completos,
        "cedula": cedula,
        "correo_institucional": correo_institucional,
        "telefono_ext": telefono_ext,
        "dependencia": dependencia,
        "area_unidad": area_unidad,
        "cargo": cargo,
        "fecha_solicitud": fecha_solicitud,
        "tipo_usuario": tipo_usuario,
        "nombre_usuario_externo": nombre_usuario_externo if tipo_usuario == "externo" else None,
        "direccion_ip": direccion_ip if direccion_ip else None,
        "tiempo_vigencia_acceso": tiempo_vigencia_acceso,
        "justificacion_necesidad_institucional": justificacion,
        "paginas_web": []
    }

    if isinstance(paginas_web, list):
        for pagina in paginas_web:
            if isinstance(pagina, dict):
                url = limpiar_texto(pagina.get("url_pagina"))
                descripcion = normalizar_espacios(pagina.get("descripcion"))
            else:
                url = limpiar_texto(pagina)
                descripcion = ""

            if url:
                datos_limpios["paginas_web"].append({
                    "url_pagina": url,
                    "descripcion": descripcion
                })

    return errores, datos_limpios


# =====================================================
# utilidades de seguridad
# =====================================================

def crear_hash_password(password):
    password_bytes = password.encode("utf-8")
    salt = bcrypt.gensalt()
    hash_generado = bcrypt.hashpw(password_bytes, salt)
    return hash_generado.decode("utf-8")


def verificar_password(password_plano, password_hash):
    try:
        return bcrypt.checkpw(
            password_plano.encode("utf-8"),
            password_hash.encode("utf-8")
        )
    except Exception:
        return False


def generar_token(usuario):
    expiracion = datetime.datetime.utcnow() + datetime.timedelta(hours=JWT_EXPIRATION_HOURS)

    payload = {
        "id": usuario["id"],
        "usuario": usuario["usuario"],
        "correo": usuario["correo"],
        "rol": usuario["rol"],
        "exp": expiracion
    }

    token = jwt.encode(payload, JWT_SECRET_KEY, algorithm="HS256")

    return token


def decodificar_token(token):
    try:
        payload = jwt.decode(token, JWT_SECRET_KEY, algorithms=["HS256"])
        return payload
    except jwt.ExpiredSignatureError:
        return None
    except jwt.InvalidTokenError:
        return None


# =====================================================
# middlewares / decoradores
# =====================================================

def token_requerido(f):
    @wraps(f)
    def decorador(*args, **kwargs):
        auth_header = request.headers.get("Authorization")

        if not auth_header:
            return jsonify({
                "estado": "error",
                "mensaje": "token no proporcionado"
            }), 401

        try:
            partes = auth_header.split(" ")

            if len(partes) != 2 or partes[0] != "Bearer":
                return jsonify({
                    "estado": "error",
                    "mensaje": "formato de token inválido"
                }), 401

            token = partes[1]
            payload = decodificar_token(token)

            if payload is None:
                return jsonify({
                    "estado": "error",
                    "mensaje": "token inválido o expirado"
                }), 401

            request.usuario_actual = payload

        except Exception as error:
            return jsonify({
                "estado": "error",
                "mensaje": "error al validar token",
                "error": str(error)
            }), 401

        return f(*args, **kwargs)

    return decorador


def roles_permitidos(*roles):
    def wrapper(f):
        @wraps(f)
        def decorador(*args, **kwargs):
            usuario_actual = getattr(request, "usuario_actual", None)

            if usuario_actual is None:
                return jsonify({
                    "estado": "error",
                    "mensaje": "usuario no autenticado"
                }), 401

            if usuario_actual["rol"] not in roles:
                return jsonify({
                    "estado": "error",
                    "mensaje": "no tiene permisos para acceder a este recurso",
                    "rol_actual": usuario_actual["rol"],
                    "roles_permitidos": roles
                }), 403

            return f(*args, **kwargs)

        return decorador

    return wrapper


# =====================================================
# funciones de usuario
# =====================================================

def obtener_usuario_por_username(username):
    conexion = get_db_connection()

    if conexion is None:
        return None

    try:
        cursor = conexion.cursor(dictionary=True)

        sql = """
            select 
                u.id,
                u.rol_id,
                r.nombre as rol,
                u.nombres,
                u.apellidos,
                u.cedula,
                u.correo,
                u.usuario,
                u.password_hash,
                u.cargo,
                u.area_unidad,
                u.dependencia,
                u.telefono_ext,
                u.estado
            from usuarios u
            inner join roles r on r.id = u.rol_id
            where u.usuario = %s
            limit 1;
        """

        cursor.execute(sql, (username,))
        usuario = cursor.fetchone()

        cursor.close()
        conexion.close()

        return usuario

    except Error as error:
        print("error al obtener usuario:", error)
        return None


def obtener_usuario_por_id(usuario_id):
    conexion = get_db_connection()

    if conexion is None:
        return None

    try:
        cursor = conexion.cursor(dictionary=True)

        sql = """
            select 
                u.id,
                u.rol_id,
                r.nombre as rol,
                u.nombres,
                u.apellidos,
                u.cedula,
                u.correo,
                u.usuario,
                u.cargo,
                u.area_unidad,
                u.dependencia,
                u.telefono_ext,
                u.estado,
                u.ultimo_acceso,
                u.created_at,
                u.updated_at
            from usuarios u
            inner join roles r on r.id = u.rol_id
            where u.id = %s
            limit 1;
        """

        cursor.execute(sql, (usuario_id,))
        usuario = cursor.fetchone()

        cursor.close()
        conexion.close()

        return usuario

    except Error as error:
        print("error al obtener usuario por id:", error)
        return None


def actualizar_ultimo_acceso(usuario_id):
    conexion = get_db_connection()

    if conexion is None:
        return False

    try:
        cursor = conexion.cursor()

        sql = """
            update usuarios
            set ultimo_acceso = now()
            where id = %s;
        """

        cursor.execute(sql, (usuario_id,))
        conexion.commit()

        cursor.close()
        conexion.close()

        return True

    except Error as error:
        print("error al actualizar último acceso:", error)
        return False


# =====================================================
# rutas de prueba
# =====================================================

@app.route("/", methods=["GET"])
def inicio():
    return jsonify({
        "estado": "ok",
        "mensaje": "backend inamhi liberación web funcionando correctamente",
        "puerto": BACKEND_PORT
    }), 200


@app.route("/api/test", methods=["GET"])
def test():
    return jsonify({
        "estado": "ok",
        "mensaje": "backend del sistema de liberacion web inamhi funcionando correctamente",
        "sistema": "sistema de gestion de solicitudes de liberacion web",
        "institucion": "inamhi",
        "version": "1.0.0",
        "backend_url": f"http://{BACKEND_HOST}:{BACKEND_PORT}"
    }), 200


@app.route("/api/test-db", methods=["GET"])
def test_db():
    conexion = get_db_connection()

    if conexion is None:
        return jsonify({
            "estado": "error",
            "mensaje": "no se pudo conectar con la base de datos mysql",
            "base_datos": DB_NAME,
            "host": DB_HOST,
            "puerto": DB_PORT,
            "usuario": DB_USER
        }), 500

    try:
        cursor = conexion.cursor(dictionary=True)

        cursor.execute("select database() as base_datos;")
        base = cursor.fetchone()

        cursor.execute("show tables;")
        tablas = cursor.fetchall()

        cursor.close()
        conexion.close()

        return jsonify({
            "estado": "ok",
            "mensaje": "conexión exitosa con mysql",
            "base_datos": base["base_datos"],
            "tablas": tablas
        }), 200

    except Error as error:
        return jsonify({
            "estado": "error",
            "mensaje": "error al consultar la base de datos",
            "error": str(error)
        }), 500


# =====================================================
# solicitud pública
# =====================================================

@app.route("/api/public/solicitudes", methods=["POST"])
def registrar_solicitud_publica():
    data = request.get_json()

    if not data:
        return jsonify({
            "estado": "error",
            "mensaje": "no se recibieron datos para registrar la solicitud."
        }), 400

    errores, datos = validar_solicitud_publica(data)

    if errores:
        return jsonify({
            "estado": "error",
            "mensaje": "existen errores de validación en el formulario.",
            "errores": errores
        }), 400

    codigo_solicitud = generar_codigo_solicitud()

    if codigo_solicitud is None:
        return jsonify({
            "estado": "error",
            "mensaje": "no se pudo generar el código de solicitud."
        }), 500

    conexion = get_db_connection()

    if conexion is None:
        return jsonify({
            "estado": "error",
            "mensaje": "no se pudo conectar con la base de datos."
        }), 500

    try:
        cursor = conexion.cursor()

        sql_solicitud = """
            insert into solicitudes (
                codigo_solicitud,
                nombres_completos,
                cedula,
                correo_institucional,
                telefono_ext,
                dependencia,
                area_unidad,
                cargo,
                fecha_solicitud,
                tipo_usuario,
                nombre_usuario_externo,
                direccion_ip,
                tiempo_vigencia_acceso,
                justificacion_necesidad_institucional,
                estado,
                etapa_actual,
                bloqueada
            ) values (
                %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s,
                'pendiente_firma_solicitante',
                'firma_solicitante',
                false
            );
        """

        valores_solicitud = (
            codigo_solicitud,
            datos["nombres_completos"],
            datos["cedula"],
            datos["correo_institucional"],
            datos["telefono_ext"],
            datos["dependencia"],
            datos["area_unidad"],
            datos["cargo"],
            convertir_fecha(datos["fecha_solicitud"]),
            datos["tipo_usuario"],
            datos["nombre_usuario_externo"],
            datos["direccion_ip"],
            datos["tiempo_vigencia_acceso"],
            datos["justificacion_necesidad_institucional"]
        )

        cursor.execute(sql_solicitud, valores_solicitud)
        solicitud_id = cursor.lastrowid

        sql_pagina = """
            insert into solicitud_paginas_web (
                solicitud_id,
                numero,
                url_pagina,
                descripcion
            ) values (
                %s, %s, %s, %s
            );
        """

        for index, pagina in enumerate(datos["paginas_web"], start=1):
            cursor.execute(sql_pagina, (
                solicitud_id,
                index,
                pagina["url_pagina"],
                pagina["descripcion"]
            ))

        conexion.commit()

        cursor.close()
        conexion.close()

        registrar_auditoria(
            usuario_id=None,
            solicitud_id=solicitud_id,
            modulo="solicitud_publica",
            accion="crear_solicitud",
            descripcion=f"solicitud pública creada con código {codigo_solicitud}",
            datos_anteriores=None,
            datos_nuevos={
                "codigo_solicitud": codigo_solicitud,
                "nombres_completos": datos["nombres_completos"],
                "cedula": datos["cedula"],
                "correo_institucional": datos["correo_institucional"],
                "estado": "pendiente_firma_solicitante",
                "etapa_actual": "firma_solicitante"
            }
        )

        return jsonify({
            "estado": "ok",
            "mensaje": "solicitud registrada correctamente.",
            "solicitud": {
                "id": solicitud_id,
                "codigo_solicitud": codigo_solicitud,
                "estado": "pendiente_firma_solicitante",
                "etapa_actual": "firma_solicitante",
                "nombres_completos": datos["nombres_completos"],
                "correo_institucional": datos["correo_institucional"]
            }
        }), 201

    except Error as error:
        conexion.rollback()

        return jsonify({
            "estado": "error",
            "mensaje": "error al registrar la solicitud.",
            "error": str(error)
        }), 500


@app.route("/api/public/solicitudes/seguimiento/<codigo>", methods=["GET"])
def seguimiento_solicitud_publica(codigo):
    codigo = limpiar_texto(codigo).upper()

    if not codigo:
        return jsonify({
            "estado": "error",
            "mensaje": "el código de solicitud es obligatorio."
        }), 400

    conexion = get_db_connection()

    if conexion is None:
        return jsonify({
            "estado": "error",
            "mensaje": "no se pudo conectar con la base de datos."
        }), 500

    try:
        cursor = conexion.cursor(dictionary=True)

        sql = """
            select
                id,
                codigo_solicitud,
                nombres_completos,
                cedula,
                correo_institucional,
                dependencia,
                area_unidad,
                cargo,
                fecha_solicitud,
                tipo_usuario,
                tiempo_vigencia_acceso,
                justificacion_necesidad_institucional,
                estado,
                etapa_actual,
                bloqueada,
                created_at,
                updated_at
            from solicitudes
            where codigo_solicitud = %s
            limit 1;
        """

        cursor.execute(sql, (codigo,))
        solicitud = cursor.fetchone()

        if solicitud is None:
            cursor.close()
            conexion.close()

            return jsonify({
                "estado": "error",
                "mensaje": "no se encontró una solicitud con ese código."
            }), 404

        sql_paginas = """
            select numero, url_pagina, descripcion
            from solicitud_paginas_web
            where solicitud_id = %s
            order by numero asc;
        """

        cursor.execute(sql_paginas, (solicitud["id"],))
        paginas = cursor.fetchall()

        cursor.close()
        conexion.close()

        return jsonify({
            "estado": "ok",
            "solicitud": solicitud,
            "paginas_web": paginas
        }), 200

    except Error as error:
        return jsonify({
            "estado": "error",
            "mensaje": "error al consultar la solicitud.",
            "error": str(error)
        }), 500


# =====================================================
# ruta temporal para generar contraseñas reales
# eliminar o comentar después de usar
# =====================================================

@app.route("/api/dev/reset-passwords", methods=["GET"])
def reset_passwords():
    conexion = get_db_connection()

    if conexion is None:
        return jsonify({
            "estado": "error",
            "mensaje": "no se pudo conectar con mysql"
        }), 500

    usuarios_passwords = [
        ("admin", "admin123"),
        ("jefe", "jefe123"),
        ("autoridad", "autoridad123"),
        ("tics", "tics123")
    ]

    try:
        cursor = conexion.cursor()

        for username, password in usuarios_passwords:
            password_hash = crear_hash_password(password)

            sql = """
                update usuarios
                set password_hash = %s
                where usuario = %s;
            """

            cursor.execute(sql, (password_hash, username))

        conexion.commit()

        cursor.close()
        conexion.close()

        return jsonify({
            "estado": "ok",
            "mensaje": "contraseñas actualizadas correctamente",
            "usuarios": [
                {
                    "usuario": "admin",
                    "password": "admin123"
                },
                {
                    "usuario": "jefe",
                    "password": "jefe123"
                },
                {
                    "usuario": "autoridad",
                    "password": "autoridad123"
                },
                {
                    "usuario": "tics",
                    "password": "tics123"
                }
            ],
            "advertencia": "esta ruta es temporal. después de usarla, se recomienda comentarla o eliminarla."
        }), 200

    except Error as error:
        return jsonify({
            "estado": "error",
            "mensaje": "error al actualizar contraseñas",
            "error": str(error)
        }), 500


# =====================================================
# autenticación
# =====================================================

@app.route("/api/auth/login", methods=["POST"])
def login():
    data = request.get_json()

    if not data:
        return jsonify({
            "estado": "error",
            "mensaje": "no se recibieron datos"
        }), 400

    username = limpiar_texto(data.get("usuario"))
    password = limpiar_texto(data.get("password"))

    if not username or not password:
        return jsonify({
            "estado": "error",
            "mensaje": "usuario y contraseña son obligatorios"
        }), 400

    usuario = obtener_usuario_por_username(username)

    if usuario is None:
        return jsonify({
            "estado": "error",
            "mensaje": "usuario o contraseña incorrectos"
        }), 401

    if usuario["estado"] != "activo":
        return jsonify({
            "estado": "error",
            "mensaje": "usuario inactivo. comuníquese con el administrador."
        }), 403

    password_correcto = verificar_password(password, usuario["password_hash"])

    if not password_correcto:
        return jsonify({
            "estado": "error",
            "mensaje": "usuario o contraseña incorrectos"
        }), 401

    token = generar_token(usuario)
    actualizar_ultimo_acceso(usuario["id"])

    return jsonify({
        "estado": "ok",
        "mensaje": "inicio de sesión exitoso",
        "token": token,
        "usuario": {
            "id": usuario["id"],
            "nombres": usuario["nombres"],
            "apellidos": usuario["apellidos"],
            "cedula": usuario["cedula"],
            "correo": usuario["correo"],
            "usuario": usuario["usuario"],
            "cargo": usuario["cargo"],
            "area_unidad": usuario["area_unidad"],
            "dependencia": usuario["dependencia"],
            "telefono_ext": usuario["telefono_ext"],
            "rol": usuario["rol"]
        }
    }), 200


@app.route("/api/auth/me", methods=["GET"])
@token_requerido
def auth_me():
    usuario_actual = request.usuario_actual
    usuario = obtener_usuario_por_id(usuario_actual["id"])

    if usuario is None:
        return jsonify({
            "estado": "error",
            "mensaje": "usuario no encontrado"
        }), 404

    return jsonify({
        "estado": "ok",
        "usuario": usuario
    }), 200


@app.route("/api/admin/test", methods=["GET"])
@token_requerido
@roles_permitidos("administrador")
def admin_test():
    return jsonify({
        "estado": "ok",
        "mensaje": "acceso permitido solo para administrador",
        "usuario": request.usuario_actual
    }), 200


@app.route("/api/tics/test", methods=["GET"])
@token_requerido
@roles_permitidos("administrador", "analista_tics")
def tics_test():
    return jsonify({
        "estado": "ok",
        "mensaje": "acceso permitido para administrador o analista tics",
        "usuario": request.usuario_actual
    }), 200
# =====================================================
# solicitudes asignadas por rol
# =====================================================

@app.route("/api/mis-solicitudes", methods=["GET"])
@token_requerido
@roles_permitidos("administrador", "jefe_inmediato", "maxima_autoridad", "analista_tics")
def listar_mis_solicitudes():
    usuario_actual = request.usuario_actual
    rol_actual = usuario_actual["rol"]

    busqueda = limpiar_texto(request.args.get("q"))

    estados_por_rol = {
        "administrador": [
            "pendiente_firma_solicitante",
            "pendiente_jefe_inmediato",
            "pendiente_maxima_autoridad",
            "pendiente_tics",
            "pendiente_ejecucion_tics",
            "finalizada",
            "rechazada_jefe_inmediato",
            "rechazada_maxima_autoridad",
            "rechazada_tics",
            "anulada"
        ],
        "jefe_inmediato": [
            "pendiente_jefe_inmediato"
        ],
        "maxima_autoridad": [
            "pendiente_maxima_autoridad"
        ],
        "analista_tics": [
            "pendiente_tics",
            "pendiente_ejecucion_tics"
        ]
    }

    estados_permitidos = estados_por_rol.get(rol_actual, [])

    if not estados_permitidos:
        return jsonify({
            "estado": "error",
            "mensaje": "el rol actual no tiene solicitudes asignadas.",
            "rol": rol_actual
        }), 403

    conexion = get_db_connection()

    if conexion is None:
        return jsonify({
            "estado": "error",
            "mensaje": "no se pudo conectar con la base de datos."
        }), 500

    try:
        cursor = conexion.cursor(dictionary=True)

        placeholders = ", ".join(["%s"] * len(estados_permitidos))
        parametros = list(estados_permitidos)

        condiciones_busqueda = ""

        if busqueda:
            condiciones_busqueda = """
                and (
                    s.codigo_solicitud like %s or
                    s.nombres_completos like %s or
                    s.cedula like %s or
                    s.correo_institucional like %s or
                    s.area_unidad like %s or
                    s.dependencia like %s
                )
            """

            valor_busqueda = f"%{busqueda}%"

            parametros.extend([
                valor_busqueda,
                valor_busqueda,
                valor_busqueda,
                valor_busqueda,
                valor_busqueda,
                valor_busqueda
            ])

        sql = f"""
            select
                s.id,
                s.codigo_solicitud,
                s.nombres_completos,
                s.cedula,
                s.correo_institucional,
                s.telefono_ext,
                s.dependencia,
                s.area_unidad,
                s.cargo,
                s.fecha_solicitud,
                s.tipo_usuario,
                s.nombre_usuario_externo,
                s.direccion_ip,
                s.tiempo_vigencia_acceso,
                s.justificacion_necesidad_institucional,
                s.estado,
                s.etapa_actual,
                s.bloqueada,
                s.created_at,
                s.updated_at,
                count(p.id) as total_paginas
            from solicitudes s
            left join solicitud_paginas_web p on p.solicitud_id = s.id
            where s.estado in ({placeholders})
            {condiciones_busqueda}
            group by s.id
            order by s.id desc;
        """

        cursor.execute(sql, tuple(parametros))
        solicitudes = cursor.fetchall()

        for solicitud in solicitudes:
            solicitud["fecha_solicitud"] = serializar_fecha(solicitud["fecha_solicitud"])
            solicitud["created_at"] = serializar_fecha(solicitud["created_at"])
            solicitud["updated_at"] = serializar_fecha(solicitud["updated_at"])

        cursor.close()
        conexion.close()

        return jsonify({
            "estado": "ok",
            "mensaje": "solicitudes asignadas obtenidas correctamente.",
            "rol": rol_actual,
            "total": len(solicitudes),
            "solicitudes": solicitudes
        }), 200

    except Error as error:
        return jsonify({
            "estado": "error",
            "mensaje": "error al obtener solicitudes asignadas.",
            "error": str(error)
        }), 500
# =====================================================
# solicitudes administrativas
# =====================================================

def serializar_fecha(valor):
    if valor is None:
        return None

    if isinstance(valor, (datetime.datetime, datetime.date)):
        return valor.strftime("%Y-%m-%d %H:%M:%S")

    return str(valor)


@app.route("/api/admin/solicitudes", methods=["GET"])
@token_requerido
@roles_permitidos("administrador", "analista_tics", "jefe_inmediato", "maxima_autoridad")
def listar_solicitudes_admin():
    estado = limpiar_texto(request.args.get("estado"))
    busqueda = limpiar_texto(request.args.get("q"))

    conexion = get_db_connection()

    if conexion is None:
        return jsonify({
            "estado": "error",
            "mensaje": "no se pudo conectar con la base de datos."
        }), 500

    try:
        cursor = conexion.cursor(dictionary=True)

        condiciones = []
        parametros = []

        if estado:
            condiciones.append("s.estado = %s")
            parametros.append(estado)

        if busqueda:
            condiciones.append("""
                (
                    s.codigo_solicitud like %s or
                    s.nombres_completos like %s or
                    s.cedula like %s or
                    s.correo_institucional like %s or
                    s.area_unidad like %s or
                    s.dependencia like %s
                )
            """)

            valor_busqueda = f"%{busqueda}%"
            parametros.extend([
                valor_busqueda,
                valor_busqueda,
                valor_busqueda,
                valor_busqueda,
                valor_busqueda,
                valor_busqueda
            ])

        where_sql = ""

        if condiciones:
            where_sql = "where " + " and ".join(condiciones)

        sql = f"""
            select
                s.id,
                s.codigo_solicitud,
                s.nombres_completos,
                s.cedula,
                s.correo_institucional,
                s.telefono_ext,
                s.dependencia,
                s.area_unidad,
                s.cargo,
                s.fecha_solicitud,
                s.tipo_usuario,
                s.nombre_usuario_externo,
                s.direccion_ip,
                s.tiempo_vigencia_acceso,
                s.justificacion_necesidad_institucional,
                s.estado,
                s.etapa_actual,
                s.bloqueada,
                s.created_at,
                s.updated_at,
                count(p.id) as total_paginas
            from solicitudes s
            left join solicitud_paginas_web p on p.solicitud_id = s.id
            {where_sql}
            group by s.id
            order by s.id desc;
        """

        cursor.execute(sql, tuple(parametros))
        solicitudes = cursor.fetchall()

        for solicitud in solicitudes:
            solicitud["fecha_solicitud"] = serializar_fecha(solicitud["fecha_solicitud"])
            solicitud["created_at"] = serializar_fecha(solicitud["created_at"])
            solicitud["updated_at"] = serializar_fecha(solicitud["updated_at"])

        cursor.close()
        conexion.close()

        return jsonify({
            "estado": "ok",
            "mensaje": "solicitudes obtenidas correctamente.",
            "total": len(solicitudes),
            "solicitudes": solicitudes
        }), 200

    except Error as error:
        return jsonify({
            "estado": "error",
            "mensaje": "error al obtener solicitudes.",
            "error": str(error)
        }), 500


# =====================================================
# generación de PDF A4 de solicitud
# =====================================================

def obtener_solicitud_completa_para_pdf(solicitud_id):
    conexion = get_db_connection()

    if conexion is None:
        return None, [], "no se pudo conectar con la base de datos."

    try:
        cursor = conexion.cursor(dictionary=True)

        sql_solicitud = """
            select
                id,
                codigo_solicitud,
                nombres_completos,
                cedula,
                correo_institucional,
                telefono_ext,
                dependencia,
                area_unidad,
                cargo,
                fecha_solicitud,
                tipo_usuario,
                nombre_usuario_externo,
                direccion_ip,
                tiempo_vigencia_acceso,
                justificacion_necesidad_institucional,
                estado,
                etapa_actual,
                bloqueada,
                created_at,
                updated_at
            from solicitudes
            where id = %s
            limit 1;
        """

        cursor.execute(sql_solicitud, (solicitud_id,))
        solicitud = cursor.fetchone()

        if solicitud is None:
            cursor.close()
            conexion.close()
            return None, [], "solicitud no encontrada."

        sql_paginas = """
            select
                numero,
                url_pagina,
                descripcion
            from solicitud_paginas_web
            where solicitud_id = %s
            order by numero asc;
        """

        cursor.execute(sql_paginas, (solicitud_id,))
        paginas_web = cursor.fetchall()

        cursor.close()
        conexion.close()

        return solicitud, paginas_web, None

    except Error as error:
        return None, [], str(error)


def texto_seguro(valor):
    if valor is None:
        return ""

    return str(valor)


def crear_parrafo(texto, estilo):
    return Paragraph(texto_seguro(texto).replace("\n", "<br/>"), estilo)


def estado_legible_pdf(estado):
    estados = {
        "pendiente_firma_solicitante": "Pendiente firma solicitante",
        "pendiente_jefe_inmediato": "Pendiente jefe inmediato",
        "rechazada_jefe_inmediato": "Rechazada jefe inmediato",
        "pendiente_maxima_autoridad": "Pendiente máxima autoridad",
        "rechazada_maxima_autoridad": "Rechazada máxima autoridad",
        "pendiente_tics": "Pendiente validación TICS",
        "rechazada_tics": "Rechazada TICS",
        "pendiente_ejecucion_tics": "Pendiente ejecución TICS",
        "finalizada": "Finalizada",
        "anulada": "Anulada"
    }

    return estados.get(estado, estado)


def etapa_legible_pdf(etapa):
    etapas = {
        "registro_publico": "Registro público",
        "firma_solicitante": "Firma del solicitante",
        "jefe_inmediato": "Jefe inmediato",
        "maxima_autoridad": "Máxima autoridad",
        "tics": "Validación TICS",
        "ejecucion_tics": "Ejecución TICS",
        "finalizado": "Finalizado"
    }

    return etapas.get(etapa, etapa)


def agregar_tabla_datos(elementos, titulo, filas, estilos):
    encabezado = [[Paragraph(f"<b>{titulo}</b>", estilos["section_title"])]]

    tabla_titulo = Table(encabezado, colWidths=[17.5 * cm])
    tabla_titulo.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), colors.HexColor("#d9eaf7")),
        ("BOX", (0, 0), (-1, -1), 1, colors.black),
        ("ALIGN", (0, 0), (-1, -1), "CENTER"),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("TOPPADDING", (0, 0), (-1, -1), 6),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
    ]))

    elementos.append(tabla_titulo)

    data = []

    for etiqueta, valor in filas:
        data.append([
            Paragraph(f"<b>{etiqueta}</b>", estilos["cell_label"]),
            Paragraph(texto_seguro(valor), estilos["cell_text"])
        ])

    tabla = Table(data, colWidths=[5.2 * cm, 12.3 * cm])
    tabla.setStyle(TableStyle([
        ("BOX", (0, 0), (-1, -1), 1, colors.black),
        ("INNERGRID", (0, 0), (-1, -1), 0.7, colors.black),
        ("BACKGROUND", (0, 0), (0, -1), colors.HexColor("#f1f5f9")),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("TOPPADDING", (0, 0), (-1, -1), 6),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
        ("LEFTPADDING", (0, 0), (-1, -1), 6),
        ("RIGHTPADDING", (0, 0), (-1, -1), 6),
    ]))

    elementos.append(tabla)
    elementos.append(Spacer(1, 10))


def agregar_espacios_firmas(elementos, estilos):
    data = [
        [
            Paragraph("<b>FIRMA DEL SOLICITANTE</b>", estilos["center"]),
            Paragraph("<b>FIRMA JEFE INMEDIATO</b>", estilos["center"])
        ],
        [
            Paragraph("<br/><br/><br/>_____________________________<br/>Nombre / Firma", estilos["center"]),
            Paragraph("<br/><br/><br/>_____________________________<br/>Nombre / Firma", estilos["center"])
        ],
        [
            Paragraph("<b>FIRMA MÁXIMA AUTORIDAD</b>", estilos["center"]),
            Paragraph("<b>FIRMA / VALIDACIÓN TICS</b>", estilos["center"])
        ],
        [
            Paragraph("<br/><br/><br/>_____________________________<br/>Nombre / Firma", estilos["center"]),
            Paragraph("<br/><br/><br/>_____________________________<br/>Nombre / Firma", estilos["center"])
        ]
    ]

    tabla = Table(data, colWidths=[8.75 * cm, 8.75 * cm])
    tabla.setStyle(TableStyle([
        ("BOX", (0, 0), (-1, -1), 1, colors.black),
        ("INNERGRID", (0, 0), (-1, -1), 0.7, colors.black),
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#e5e7eb")),
        ("BACKGROUND", (0, 2), (-1, 2), colors.HexColor("#e5e7eb")),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("TOPPADDING", (0, 0), (-1, -1), 8),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 8),
    ]))

    elementos.append(tabla)
    elementos.append(Spacer(1, 10))


def agregar_seccion_tics(elementos, estilos):
    elementos.append(PageBreak())

    titulo = Table(
        [[
            Paragraph("<b>2</b>", estilos["number_box"]),
            Paragraph("<b>PARA USO EXCLUSIVO DE LA UNIDAD DE TICS</b><br/>(GESTIÓN DE SEGURIDAD DE TIC´S)", estilos["center"])
        ]],
        colWidths=[1.5 * cm, 16 * cm]
    )

    titulo.setStyle(TableStyle([
        ("BOX", (0, 0), (-1, -1), 1.2, colors.black),
        ("INNERGRID", (0, 0), (-1, -1), 1, colors.black),
        ("BACKGROUND", (0, 0), (-1, -1), colors.HexColor("#bfbfbf")),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("ALIGN", (0, 0), (-1, -1), "CENTER"),
        ("TOPPADDING", (0, 0), (-1, -1), 6),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
    ]))

    elementos.append(titulo)

    autorizacion = Table(
        [
            [
                Paragraph("<b>AUTORIZACIÓN:</b>", estilos["small"]),
                Paragraph("Campo validado por TICS", estilos["small"]),
                Paragraph("☐ Aprobar", estilos["small"]),
                Paragraph("☐ Rechazar", estilos["small"])
            ]
        ],
        colWidths=[3.2 * cm, 5.2 * cm, 4.5 * cm, 4.6 * cm]
    )

    autorizacion.setStyle(TableStyle([
        ("BOX", (0, 0), (-1, -1), 1, colors.black),
        ("INNERGRID", (0, 0), (-1, -1), 0.8, colors.black),
        ("BACKGROUND", (0, 0), (0, 0), colors.HexColor("#e5e5e5")),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("TOPPADDING", (0, 0), (-1, -1), 7),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 7),
    ]))

    elementos.append(autorizacion)

    observacion = Table(
        [
            [Paragraph("<b>OBSERVACIÓN</b>", estilos["small"])],
            [Paragraph("<br/><br/><br/><br/>", estilos["small"])]
        ],
        colWidths=[17.5 * cm]
    )

    observacion.setStyle(TableStyle([
        ("BOX", (0, 0), (-1, -1), 1, colors.black),
        ("LINEBELOW", (0, 0), (-1, 0), 1, colors.black),
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#e5e5e5")),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("TOPPADDING", (0, 0), (-1, -1), 6),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
    ]))

    elementos.append(observacion)

    firma_coordinador = Table(
        [
            [Paragraph("<br/><br/><br/>Nombre: _________________________________", estilos["center"])],
            [Paragraph("<b>COORDINADOR DE TICS</b>", estilos["center"])]
        ],
        colWidths=[17.5 * cm]
    )

    firma_coordinador.setStyle(TableStyle([
        ("BOX", (0, 0), (-1, -1), 1, colors.black),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("TOPPADDING", (0, 0), (-1, -1), 8),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 8),
    ]))

    elementos.append(firma_coordinador)

    responsable = Table(
        [[Paragraph("<b>RESPONSABLE DE LA EJECUCIÓN</b>", estilos["center"])]],
        colWidths=[17.5 * cm]
    )

    responsable.setStyle(TableStyle([
        ("BOX", (0, 0), (-1, -1), 1, colors.black),
        ("BACKGROUND", (0, 0), (-1, -1), colors.HexColor("#bfbfbf")),
        ("TOPPADDING", (0, 0), (-1, -1), 6),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
    ]))

    elementos.append(responsable)

    ejecucion = Table(
        [
            [
                Paragraph("<b>FECHA DE EJECUCIÓN:</b>", estilos["small"]),
                Paragraph("", estilos["small"])
            ],
            [
                Paragraph("<b>OBSERVACIONES:</b>", estilos["small"]),
                Paragraph("", estilos["small"])
            ],
            [
                Paragraph("<br/>", estilos["small"]),
                Paragraph("<br/>", estilos["small"])
            ],
            [
                Paragraph("<br/>", estilos["small"]),
                Paragraph("<br/>", estilos["small"])
            ]
        ],
        colWidths=[4.8 * cm, 12.7 * cm]
    )

    ejecucion.setStyle(TableStyle([
        ("BOX", (0, 0), (-1, -1), 1, colors.black),
        ("INNERGRID", (0, 0), (-1, -1), 0.8, colors.black),
        ("BACKGROUND", (0, 0), (0, 1), colors.HexColor("#e5e5e5")),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("TOPPADDING", (0, 0), (-1, -1), 6),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
    ]))

    elementos.append(ejecucion)

    firma_admin = Table(
        [
            [Paragraph("<br/><br/>Nombre: _________________________________", estilos["center"])],
            [Paragraph("<b>Administrador de Firewall INAMHI</b>", estilos["center"])]
        ],
        colWidths=[17.5 * cm]
    )

    firma_admin.setStyle(TableStyle([
        ("BOX", (0, 0), (-1, -1), 1, colors.black),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("TOPPADDING", (0, 0), (-1, -1), 8),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 8),
    ]))

    elementos.append(firma_admin)

    nota = Paragraph(
        "<b>Nota:</b> Este formulario deberá ser entregado en la Unidad de TICS de manera física "
        "o digital con las firmas correspondientes. Los solicitantes se hacen responsables de la "
        "información a la que accedan y se comprometen a cumplir las políticas de seguridad de la "
        "información establecidas en TICS-INAMHI.",
        estilos["small"]
    )

    elementos.append(Spacer(1, 8))
    elementos.append(nota)


def generar_pdf_solicitud_a4(solicitud, paginas_web):
    buffer = BytesIO()

    documento = SimpleDocTemplate(
        buffer,
        pagesize=A4,
        rightMargin=1.5 * cm,
        leftMargin=1.5 * cm,
        topMargin=1.2 * cm,
        bottomMargin=1.2 * cm
    )

    styles = getSampleStyleSheet()

    estilos = {
        "title": ParagraphStyle(
            "title",
            parent=styles["Title"],
            fontName="Helvetica-Bold",
            fontSize=14,
            leading=18,
            alignment=1,
            textColor=colors.black
        ),
        "subtitle": ParagraphStyle(
            "subtitle",
            parent=styles["Normal"],
            fontSize=9,
            leading=12,
            alignment=1,
            textColor=colors.HexColor("#334155")
        ),
        "section_title": ParagraphStyle(
            "section_title",
            parent=styles["Normal"],
            fontName="Helvetica-Bold",
            fontSize=9,
            leading=11,
            alignment=1
        ),
        "cell_label": ParagraphStyle(
            "cell_label",
            parent=styles["Normal"],
            fontName="Helvetica-Bold",
            fontSize=8,
            leading=10
        ),
        "cell_text": ParagraphStyle(
            "cell_text",
            parent=styles["Normal"],
            fontSize=8,
            leading=10
        ),
        "small": ParagraphStyle(
            "small",
            parent=styles["Normal"],
            fontSize=8,
            leading=10
        ),
        "center": ParagraphStyle(
            "center",
            parent=styles["Normal"],
            fontSize=8,
            leading=10,
            alignment=1
        ),
        "number_box": ParagraphStyle(
            "number_box",
            parent=styles["Normal"],
            fontName="Helvetica-Bold",
            fontSize=14,
            leading=16,
            alignment=1
        )
    }

    elementos = []

    encabezado = Table(
        [
            [
                Paragraph("<b>INAMHI</b>", estilos["title"]),
                Paragraph("<b>SOLICITUD DE LIBERACIÓN WEB INSTITUCIONAL</b>", estilos["title"])
            ],
            [
                Paragraph("Instituto Nacional de Meteorología e Hidrología", estilos["subtitle"]),
                Paragraph(f"Código: <b>{solicitud['codigo_solicitud']}</b>", estilos["subtitle"])
            ]
        ],
        colWidths=[5 * cm, 12.5 * cm]
    )

    encabezado.setStyle(TableStyle([
        ("BOX", (0, 0), (-1, -1), 1, colors.black),
        ("INNERGRID", (0, 0), (-1, -1), 0.7, colors.black),
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#d9eaf7")),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("TOPPADDING", (0, 0), (-1, -1), 7),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 7),
    ]))

    elementos.append(encabezado)
    elementos.append(Spacer(1, 10))

    agregar_tabla_datos(
        elementos,
        "1. DATOS DEL SOLICITANTE",
        [
            ("Código de solicitud", solicitud["codigo_solicitud"]),
            ("Nombres completos", solicitud["nombres_completos"]),
            ("Cédula", solicitud["cedula"]),
            ("Correo institucional", solicitud["correo_institucional"]),
            ("Teléfono", solicitud["telefono_ext"]),
            ("Dependencia", solicitud["dependencia"]),
            ("Área / Unidad", solicitud["area_unidad"]),
            ("Cargo", solicitud["cargo"]),
            ("Fecha de solicitud", serializar_fecha(solicitud["fecha_solicitud"])),
        ],
        estilos
    )

    agregar_tabla_datos(
        elementos,
        "2. INFORMACIÓN DEL ACCESO SOLICITADO",
        [
            ("Tipo de usuario", solicitud["tipo_usuario"]),
            ("Usuario externo", solicitud["nombre_usuario_externo"] or "No aplica"),
            ("Dirección IP", solicitud["direccion_ip"] or "No registrada"),
            ("Tiempo de vigencia", solicitud["tiempo_vigencia_acceso"]),
            ("Estado actual", estado_legible_pdf(solicitud["estado"])),
            ("Etapa actual", etapa_legible_pdf(solicitud["etapa_actual"])),
        ],
        estilos
    )

    data_paginas = [
        [
            Paragraph("<b>N°</b>", estilos["cell_label"]),
            Paragraph("<b>URL / Página web</b>", estilos["cell_label"]),
            Paragraph("<b>Descripción</b>", estilos["cell_label"])
        ]
    ]

    if paginas_web:
        for pagina in paginas_web:
            data_paginas.append([
                Paragraph(str(pagina.get("numero", "")), estilos["cell_text"]),
                Paragraph(texto_seguro(pagina.get("url_pagina")), estilos["cell_text"]),
                Paragraph(texto_seguro(pagina.get("descripcion")), estilos["cell_text"])
            ])
    else:
        data_paginas.append([
            Paragraph("-", estilos["cell_text"]),
            Paragraph("Sin páginas registradas", estilos["cell_text"]),
            Paragraph("-", estilos["cell_text"])
        ])

    titulo_paginas = Table(
        [[Paragraph("<b>3. PÁGINAS WEB SOLICITADAS</b>", estilos["section_title"])]],
        colWidths=[17.5 * cm]
    )

    titulo_paginas.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), colors.HexColor("#d9eaf7")),
        ("BOX", (0, 0), (-1, -1), 1, colors.black),
        ("ALIGN", (0, 0), (-1, -1), "CENTER"),
        ("TOPPADDING", (0, 0), (-1, -1), 6),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
    ]))

    elementos.append(titulo_paginas)

    tabla_paginas = Table(data_paginas, colWidths=[1.2 * cm, 8.5 * cm, 7.8 * cm])
    tabla_paginas.setStyle(TableStyle([
        ("BOX", (0, 0), (-1, -1), 1, colors.black),
        ("INNERGRID", (0, 0), (-1, -1), 0.7, colors.black),
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#f1f5f9")),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("TOPPADDING", (0, 0), (-1, -1), 6),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
    ]))

    elementos.append(tabla_paginas)
    elementos.append(Spacer(1, 10))

    titulo_justificacion = Table(
        [[Paragraph("<b>4. JUSTIFICACIÓN DE LA NECESIDAD INSTITUCIONAL</b>", estilos["section_title"])]],
        colWidths=[17.5 * cm]
    )

    titulo_justificacion.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), colors.HexColor("#d9eaf7")),
        ("BOX", (0, 0), (-1, -1), 1, colors.black),
        ("ALIGN", (0, 0), (-1, -1), "CENTER"),
        ("TOPPADDING", (0, 0), (-1, -1), 6),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
    ]))

    elementos.append(titulo_justificacion)

    tabla_justificacion = Table(
        [[crear_parrafo(solicitud["justificacion_necesidad_institucional"], estilos["cell_text"])]],
        colWidths=[17.5 * cm]
    )

    tabla_justificacion.setStyle(TableStyle([
        ("BOX", (0, 0), (-1, -1), 1, colors.black),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("TOPPADDING", (0, 0), (-1, -1), 8),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 30),
        ("LEFTPADDING", (0, 0), (-1, -1), 8),
        ("RIGHTPADDING", (0, 0), (-1, -1), 8),
    ]))

    elementos.append(tabla_justificacion)
    elementos.append(Spacer(1, 12))

    agregar_espacios_firmas(elementos, estilos)
    agregar_seccion_tics(elementos, estilos)

    documento.build(elementos)

    buffer.seek(0)
    return buffer


@app.route("/api/admin/solicitudes/<int:solicitud_id>/pdf", methods=["GET"])
@token_requerido
@roles_permitidos("administrador", "jefe_inmediato", "maxima_autoridad", "analista_tics")
def descargar_pdf_solicitud(solicitud_id):
    solicitud, paginas_web, error = obtener_solicitud_completa_para_pdf(solicitud_id)

    if error:
        return jsonify({
            "estado": "error",
            "mensaje": error
        }), 404

    try:
        pdf_buffer = generar_pdf_solicitud_a4(solicitud, paginas_web)

        nombre_archivo = f"{solicitud['codigo_solicitud']}.pdf"

        return send_file(
            pdf_buffer,
            mimetype="application/pdf",
            as_attachment=True,
            download_name=nombre_archivo
        )

    except Exception as error:
        return jsonify({
            "estado": "error",
            "mensaje": "error al generar el PDF.",
            "error": str(error)
        }), 500
    
@app.route("/api/admin/solicitudes/<int:solicitud_id>", methods=["GET"])
@token_requerido
@roles_permitidos("administrador", "analista_tics", "jefe_inmediato", "maxima_autoridad")
def obtener_solicitud_admin(solicitud_id):
    conexion = get_db_connection()

    if conexion is None:
        return jsonify({
            "estado": "error",
            "mensaje": "no se pudo conectar con la base de datos."
        }), 500

    try:
        cursor = conexion.cursor(dictionary=True)

        sql_solicitud = """
            select
                id,
                codigo_solicitud,
                nombres_completos,
                cedula,
                correo_institucional,
                telefono_ext,
                dependencia,
                area_unidad,
                cargo,
                fecha_solicitud,
                tipo_usuario,
                nombre_usuario_externo,
                direccion_ip,
                tiempo_vigencia_acceso,
                justificacion_necesidad_institucional,
                estado,
                etapa_actual,
                bloqueada,
                created_at,
                updated_at
            from solicitudes
            where id = %s
            limit 1;
        """

        cursor.execute(sql_solicitud, (solicitud_id,))
        solicitud = cursor.fetchone()

        if solicitud is None:
            cursor.close()
            conexion.close()

            return jsonify({
                "estado": "error",
                "mensaje": "solicitud no encontrada."
            }), 404

        solicitud["fecha_solicitud"] = serializar_fecha(solicitud["fecha_solicitud"])
        solicitud["created_at"] = serializar_fecha(solicitud["created_at"])
        solicitud["updated_at"] = serializar_fecha(solicitud["updated_at"])

        sql_paginas = """
            select
                id,
                numero,
                url_pagina,
                descripcion
            from solicitud_paginas_web
            where solicitud_id = %s
            order by numero asc;
        """

        cursor.execute(sql_paginas, (solicitud_id,))
        paginas_web = cursor.fetchall()

        cursor.close()
        conexion.close()

        return jsonify({
            "estado": "ok",
            "solicitud": solicitud,
            "paginas_web": paginas_web
        }), 200

    except Error as error:
        return jsonify({
            "estado": "error",
            "mensaje": "error al obtener la solicitud.",
            "error": str(error)
        }), 500
    
    # =====================================================
# flujo administrativo de aprobación / rechazo
# =====================================================

def obtener_solicitud_por_id_simple(solicitud_id):
    conexion = get_db_connection()

    if conexion is None:
        return None

    try:
        cursor = conexion.cursor(dictionary=True)

        sql = """
            select
                id,
                codigo_solicitud,
                estado,
                etapa_actual,
                bloqueada,
                nombres_completos,
                correo_institucional
            from solicitudes
            where id = %s
            limit 1;
        """

        cursor.execute(sql, (solicitud_id,))
        solicitud = cursor.fetchone()

        cursor.close()
        conexion.close()

        return solicitud

    except Error as error:
        print("error al obtener solicitud simple:", error)
        return None


def usuario_puede_gestionar_estado(rol, estado):
    permisos = {
        "pendiente_firma_solicitante": ["administrador"],
        "pendiente_jefe_inmediato": ["administrador", "jefe_inmediato"],
        "pendiente_maxima_autoridad": ["administrador", "maxima_autoridad"],
        "pendiente_tics": ["administrador", "analista_tics"],
        "pendiente_ejecucion_tics": ["administrador", "analista_tics"]
    }

    return rol in permisos.get(estado, [])


def obtener_siguiente_estado_aprobacion(estado_actual):
    flujo = {
        "pendiente_firma_solicitante": {
            "nuevo_estado": "pendiente_jefe_inmediato",
            "nueva_etapa": "jefe_inmediato",
            "accion": "firma_solicitante_validada"
        },
        "pendiente_jefe_inmediato": {
            "nuevo_estado": "pendiente_maxima_autoridad",
            "nueva_etapa": "maxima_autoridad",
            "accion": "aprobacion_jefe_inmediato"
        },
        "pendiente_maxima_autoridad": {
            "nuevo_estado": "pendiente_tics",
            "nueva_etapa": "tics",
            "accion": "aprobacion_maxima_autoridad"
        },
        "pendiente_tics": {
            "nuevo_estado": "pendiente_ejecucion_tics",
            "nueva_etapa": "ejecucion_tics",
            "accion": "aprobacion_tics"
        },
        "pendiente_ejecucion_tics": {
            "nuevo_estado": "finalizada",
            "nueva_etapa": "finalizado",
            "accion": "finalizacion_tics"
        }
    }

    return flujo.get(estado_actual)


def obtener_estado_rechazo(estado_actual):
    rechazos = {
        "pendiente_jefe_inmediato": {
            "nuevo_estado": "rechazada_jefe_inmediato",
            "nueva_etapa": "jefe_inmediato",
            "accion": "rechazo_jefe_inmediato"
        },
        "pendiente_maxima_autoridad": {
            "nuevo_estado": "rechazada_maxima_autoridad",
            "nueva_etapa": "maxima_autoridad",
            "accion": "rechazo_maxima_autoridad"
        },
        "pendiente_tics": {
            "nuevo_estado": "rechazada_tics",
            "nueva_etapa": "tics",
            "accion": "rechazo_tics"
        }
    }

    return rechazos.get(estado_actual)


@app.route("/api/admin/solicitudes/<int:solicitud_id>/aprobar", methods=["PUT"])
@token_requerido
@roles_permitidos("administrador", "jefe_inmediato", "maxima_autoridad", "analista_tics")
def aprobar_solicitud(solicitud_id):
    usuario_actual = request.usuario_actual
    rol_actual = usuario_actual["rol"]

    solicitud = obtener_solicitud_por_id_simple(solicitud_id)

    if solicitud is None:
        return jsonify({
            "estado": "error",
            "mensaje": "solicitud no encontrada."
        }), 404

    if solicitud["bloqueada"]:
        return jsonify({
            "estado": "error",
            "mensaje": "la solicitud se encuentra bloqueada y no puede ser modificada."
        }), 400

    estado_actual = solicitud["estado"]

    if estado_actual.startswith("rechazada") or estado_actual in ["finalizada", "anulada"]:
        return jsonify({
            "estado": "error",
            "mensaje": "esta solicitud ya no puede avanzar porque se encuentra cerrada."
        }), 400

    if not usuario_puede_gestionar_estado(rol_actual, estado_actual):
        return jsonify({
            "estado": "error",
            "mensaje": "su rol no tiene permiso para aprobar esta etapa.",
            "rol_actual": rol_actual,
            "estado_actual": estado_actual
        }), 403

    siguiente = obtener_siguiente_estado_aprobacion(estado_actual)

    if siguiente is None:
        return jsonify({
            "estado": "error",
            "mensaje": "no existe una transición de aprobación válida para el estado actual."
        }), 400

    conexion = get_db_connection()

    if conexion is None:
        return jsonify({
            "estado": "error",
            "mensaje": "no se pudo conectar con la base de datos."
        }), 500

    try:
        cursor = conexion.cursor()

        sql = """
            update solicitudes
            set
                estado = %s,
                etapa_actual = %s,
                updated_at = now()
            where id = %s;
        """

        cursor.execute(sql, (
            siguiente["nuevo_estado"],
            siguiente["nueva_etapa"],
            solicitud_id
        ))

        conexion.commit()
        cursor.close()
        conexion.close()

        registrar_auditoria(
            usuario_id=usuario_actual["id"],
            solicitud_id=solicitud_id,
            modulo="flujo_solicitudes",
            accion=siguiente["accion"],
            descripcion=f"solicitud {solicitud['codigo_solicitud']} aprobada por rol {rol_actual}",
            datos_anteriores={
                "estado": estado_actual,
                "etapa_actual": solicitud["etapa_actual"]
            },
            datos_nuevos={
                "estado": siguiente["nuevo_estado"],
                "etapa_actual": siguiente["nueva_etapa"]
            }
        )

        return jsonify({
            "estado": "ok",
            "mensaje": "solicitud aprobada correctamente.",
            "solicitud": {
                "id": solicitud_id,
                "codigo_solicitud": solicitud["codigo_solicitud"],
                "estado_anterior": estado_actual,
                "estado_actual": siguiente["nuevo_estado"],
                "etapa_actual": siguiente["nueva_etapa"]
            }
        }), 200

    except Error as error:
        conexion.rollback()

        return jsonify({
            "estado": "error",
            "mensaje": "error al aprobar la solicitud.",
            "error": str(error)
        }), 500


@app.route("/api/admin/solicitudes/<int:solicitud_id>/rechazar", methods=["PUT"])
@token_requerido
@roles_permitidos("administrador", "jefe_inmediato", "maxima_autoridad", "analista_tics")
def rechazar_solicitud(solicitud_id):
    usuario_actual = request.usuario_actual
    rol_actual = usuario_actual["rol"]

    data = request.get_json() or {}
    motivo = normalizar_espacios(data.get("motivo"))

    if not motivo:
        return jsonify({
            "estado": "error",
            "mensaje": "el motivo del rechazo es obligatorio."
        }), 400

    if len(motivo) < 10:
        return jsonify({
            "estado": "error",
            "mensaje": "el motivo del rechazo debe tener mínimo 10 caracteres."
        }), 400

    if len(motivo) > 1000:
        return jsonify({
            "estado": "error",
            "mensaje": "el motivo del rechazo no puede superar 1000 caracteres."
        }), 400

    solicitud = obtener_solicitud_por_id_simple(solicitud_id)

    if solicitud is None:
        return jsonify({
            "estado": "error",
            "mensaje": "solicitud no encontrada."
        }), 404

    if solicitud["bloqueada"]:
        return jsonify({
            "estado": "error",
            "mensaje": "la solicitud se encuentra bloqueada y no puede ser modificada."
        }), 400

    estado_actual = solicitud["estado"]

    if estado_actual in ["pendiente_firma_solicitante", "pendiente_ejecucion_tics"]:
        return jsonify({
            "estado": "error",
            "mensaje": "esta etapa no permite rechazo directo desde este módulo."
        }), 400

    if estado_actual.startswith("rechazada") or estado_actual in ["finalizada", "anulada"]:
        return jsonify({
            "estado": "error",
            "mensaje": "esta solicitud ya se encuentra cerrada."
        }), 400

    if not usuario_puede_gestionar_estado(rol_actual, estado_actual):
        return jsonify({
            "estado": "error",
            "mensaje": "su rol no tiene permiso para rechazar esta etapa.",
            "rol_actual": rol_actual,
            "estado_actual": estado_actual
        }), 403

    rechazo = obtener_estado_rechazo(estado_actual)

    if rechazo is None:
        return jsonify({
            "estado": "error",
            "mensaje": "no existe una transición de rechazo válida para el estado actual."
        }), 400

    conexion = get_db_connection()

    if conexion is None:
        return jsonify({
            "estado": "error",
            "mensaje": "no se pudo conectar con la base de datos."
        }), 500

    try:
        cursor = conexion.cursor()

        sql = """
            update solicitudes
            set
                estado = %s,
                etapa_actual = %s,
                motivo_rechazo = %s,
                fecha_rechazo = now(),
                rechazado_por_usuario_id = %s,
                updated_at = now()
            where id = %s;
        """

        cursor.execute(sql, (
            rechazo["nuevo_estado"],
            rechazo["nueva_etapa"],
            motivo,
            usuario_actual["id"],
            solicitud_id
        ))

        conexion.commit()
        cursor.close()
        conexion.close()

        registrar_auditoria(
            usuario_id=usuario_actual["id"],
            solicitud_id=solicitud_id,
            modulo="flujo_solicitudes",
            accion=rechazo["accion"],
            descripcion=f"solicitud {solicitud['codigo_solicitud']} rechazada por rol {rol_actual}",
            datos_anteriores={
                "estado": estado_actual,
                "etapa_actual": solicitud["etapa_actual"]
            },
            datos_nuevos={
                "estado": rechazo["nuevo_estado"],
                "etapa_actual": rechazo["nueva_etapa"],
                "motivo": motivo
            }
        )

        return jsonify({
            "estado": "ok",
            "mensaje": "solicitud rechazada correctamente.",
            "solicitud": {
                "id": solicitud_id,
                "codigo_solicitud": solicitud["codigo_solicitud"],
                "estado_anterior": estado_actual,
                "estado_actual": rechazo["nuevo_estado"],
                "etapa_actual": rechazo["nueva_etapa"],
                "motivo": motivo
            }
        }), 200

    except Error as error:
        conexion.rollback()

        return jsonify({
            "estado": "error",
            "mensaje": "error al rechazar la solicitud.",
            "error": str(error)
        }), 500
# =====================================================
# manejo de errores
# =====================================================

@app.errorhandler(404)
def ruta_no_encontrada(error):
    return jsonify({
        "estado": "error",
        "mensaje": "ruta no encontrada",
        "detalle": str(error)
    }), 404


@app.errorhandler(500)
def error_interno(error):
    return jsonify({
        "estado": "error",
        "mensaje": "error interno del servidor",
        "detalle": str(error)
    }), 500


# =====================================================
# iniciar servidor
# =====================================================

if __name__ == "__main__":
    print("======================================")
    print(" backend inamhi liberación web iniciado correctamente ")
    print(f" url test: http://{BACKEND_HOST}:{BACKEND_PORT}/api/test ")
    print(f" url mysql: http://{BACKEND_HOST}:{BACKEND_PORT}/api/test-db ")
    print(f" url reset passwords: http://{BACKEND_HOST}:{BACKEND_PORT}/api/dev/reset-passwords ")
    print(f" url registrar solicitud: http://{BACKEND_HOST}:{BACKEND_PORT}/api/public/solicitudes ")
    print(" frontend permitido: http://localhost:4300 ")
    print("======================================")

    app.run(
        host=BACKEND_HOST,
        port=BACKEND_PORT,
        debug=True
    )