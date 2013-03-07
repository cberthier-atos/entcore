/*
 * To change this template, choose Tools | Templates
 * and open the template in the editor.
 */
package edu.one.core.sync.aaf;

import java.util.ArrayList;
import java.util.List;
import org.vertx.java.core.logging.Logger;
import org.xml.sax.Attributes;
import org.xml.sax.SAXException;
import org.xml.sax.helpers.DefaultHandler;

/**
 *
 * @author bperez
 */
public class SaxContentHandler extends DefaultHandler {
	private Logger log;
	public Operation oc;
	public List<Operation> operations;
	public int nbOp = 0;
	public SaxContentHandler(Logger log) {
		this.log = log;
	}

	@Override
	public void startDocument() throws SAXException {
		super.startDocument();
		operations = new ArrayList<>();
	}

	@Override
	public void endDocument() throws SAXException {
		super.endDocument();
		nbOp += operations.size();
		log.info("Nombre d'opérations total = " + nbOp);
	}

	@Override
	public void startElement(String uri, String localName, String qName, Attributes attributes) throws SAXException {
		super.startElement(uri, localName, qName, attributes);
		
		switch (qName) {
			case Constantes.ADD_TAG : 
				this.oc = new Operation(qName);
				break;
			case Constantes.UPDATE_TAG : 
				this.oc = new Operation(qName);
				break;
			case Constantes.DELETE_TAG : 
				this.oc = new Operation(qName);
				break;
			case Constantes.OPERATIONAL_ATTRIBUTES_TAG :
				this.oc.etatAvancement = this.oc.etatAvancement.suivant();
				break;
			case Constantes.IDENTIFIER_TAG :
				this.oc.etatAvancement = this.oc.etatAvancement.suivant();
				break;
			case Constantes.ATTR_TAG :
				if (Operation.EtatAvancement.ATTRIBUTS.equals(oc.etatAvancement)) {
					oc.creerAttributCourant((String)attributes.getValue(Constantes.ATTRIBUTE_NAME_INDEX));
				}
				break;
			case Constantes.ATTRIBUTES_TAG :
				this.oc.etatAvancement = this.oc.etatAvancement.suivant();
				break;
			default :
				break;
		}
	}

	@Override
	public void characters(char[] ch, int start, int length) throws SAXException {
		super.characters(ch, start, length);
		
		String valeur = new String(ch, start, length);
		switch (this.oc.etatAvancement) {
			case TYPE_ENTITE :
				this.oc.typeEntite = Operation.TypeEntite.valueOf(valeur.toUpperCase());
			case ID :
				this.oc.id = valeur;
			case ATTRIBUTS :
				if (Operation.EtatAvancement.ATTRIBUTS.equals(oc.etatAvancement)) {
					this.oc.ajouterValeur(valeur);
				}
			default :
				break;
		}
	}

	@Override
	public void endElement(String uri, String localName, String qName) throws SAXException {
		super.endElement(uri, localName, qName);
		
		switch (qName) {
			case Constantes.ADD_TAG : 
				operations.add(oc);
				break;
			case Constantes.UPDATE_TAG : 
				operations.add(oc);
				break;
			case Constantes.DELETE_TAG : 
				operations.add(oc);
				break;
			case Constantes.ATTR_TAG :
				if (Operation.EtatAvancement.ATTRIBUTS.equals(oc.etatAvancement)) {
					oc.ajouterAttributCourant();
				}
				break;
			default :
				break;
		}
	}
}